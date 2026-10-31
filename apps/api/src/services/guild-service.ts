import { generateId } from '@strata/snowflake';
import {
  Permissions,
  DEFAULT_EVERYONE_PERMISSIONS,
  computeChannelPermissions,
  hasPermission,
  canManage,
  type Role,
  type Channel,
  type Guild,
  type GuildMember,
  type PermissionOverwrite
} from '@strata/permissions';

export interface GuildEntity {
  id: string;
  name: string;
  ownerId: string;
  description: string | null;
  iconHash: string | null;
  memberCount: number;
  createdAt: Date;
}

export interface ChannelEntity extends Channel {
  name: string;
  topic?: string | null;
  position: number;
  nsfw?: boolean;
}

export interface MemberEntity extends GuildMember {
  nickname: string | null;
  joinedAt: Date;
}

export interface InviteEntity {
  code: string;
  guildId: string;
  channelId: string;
  inviterId: string;
  maxUses: number;
  uses: number;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface AuditLogEntity {
  id: string;
  guildId: string;
  actorId: string;
  action: string;
  targetId: string;
  changes: Record<string, unknown>;
  reason: string | null;
  createdAt: Date;
}

export class GuildService {
  public guilds = new Map<string, GuildEntity>();
  public roles = new Map<string, Role[]>(); // guildId -> roles
  public channels = new Map<string, ChannelEntity[]>(); // guildId -> channels
  public members = new Map<string, MemberEntity[]>(); // guildId -> members
  public invites = new Map<string, InviteEntity>(); // code -> invite
  public auditLogs = new Map<string, AuditLogEntity[]>(); // guildId -> logs

  /**
   * Creates a new guild with @everyone role, "Genel" category, text and voice channels, and adds owner.
   */
  public async createGuild(ownerId: string, name: string): Promise<{
    guild: GuildEntity;
    defaultChannelId: string;
  }> {
    const guildId = generateId();
    const guild: GuildEntity = {
      id: guildId,
      name,
      ownerId,
      description: null,
      iconHash: null,
      memberCount: 1,
      createdAt: new Date()
    };
    this.guilds.set(guildId, guild);

    // 1. Create @everyone role (role ID equals guild ID per spec)
    const everyoneRole: Role = {
      id: guildId,
      guildId,
      name: '@everyone',
      position: 0,
      permissions: DEFAULT_EVERYONE_PERMISSIONS
    };
    this.roles.set(guildId, [everyoneRole]);

    // 2. Create "Genel" category
    const categoryId = generateId();
    const category: ChannelEntity = {
      id: categoryId,
      guildId,
      type: 'GUILD_CATEGORY',
      name: 'Genel',
      position: 0,
      overwrites: []
    };

    // 3. Create #genel text channel
    const textChannelId = generateId();
    const textChannel: ChannelEntity = {
      id: textChannelId,
      guildId,
      type: 'GUILD_TEXT',
      name: 'genel',
      parentId: categoryId,
      position: 1,
      permissionsSynced: true,
      overwrites: []
    };

    // 4. Create "Ses Kanalı"
    const voiceChannelId = generateId();
    const voiceChannel: ChannelEntity = {
      id: voiceChannelId,
      guildId,
      type: 'GUILD_VOICE',
      name: 'Sohbet',
      parentId: categoryId,
      position: 2,
      permissionsSynced: true,
      overwrites: []
    };

    this.channels.set(guildId, [category, textChannel, voiceChannel]);

    // 5. Add owner as first member
    const ownerMember: MemberEntity = {
      userId: ownerId,
      guildId,
      roleIds: [],
      nickname: null,
      joinedAt: new Date()
    };
    this.members.set(guildId, [ownerMember]);

    return { guild, defaultChannelId: textChannelId };
  }

  public getGuild(guildId: string): GuildEntity | null {
    return this.guilds.get(guildId) || null;
  }

  /** Returns all guilds where the given user is a member. */
  public getMemberGuilds(userId: string): GuildEntity[] {
    const result: GuildEntity[] = [];
    for (const [guildId, members] of this.members.entries()) {
      if (members.some((m) => m.userId === userId)) {
        const guild = this.guilds.get(guildId);
        if (guild) result.push(guild);
      }
    }
    return result;
  }

  public getMember(guildId: string, userId: string): MemberEntity | null {
    const list = this.members.get(guildId) || [];
    return list.find((m) => m.userId === userId) || null;
  }

  public getGuildRoles(guildId: string): Role[] {
    return this.roles.get(guildId) || [];
  }

  public getGuildChannels(guildId: string): ChannelEntity[] {
    return this.channels.get(guildId) || [];
  }

  public getChannel(channelId: string): ChannelEntity | null {
    for (const list of this.channels.values()) {
      const found = list.find((c) => c.id === channelId);
      if (found) return found;
    }
    return null;
  }

  /**
   * Creates a new role with role hierarchy check.
   */
  public async createRole(
    guildId: string,
    actorId: string,
    roleData: { name: string; permissions?: bigint | string; position?: number }
  ): Promise<Role> {
    const guildObj = this.getGuildAsObject(guildId);
    const actor = this.getMember(guildId, actorId);
    if (!actor) throw new Error('Üye bulunamadı.');

    const actorBase = this.getBasePermissions(guildId, actorId);
    if (!hasPermission(actorBase, Permissions.MANAGE_ROLES)) {
      throw new Error('Rol oluşturmak için MANAGE_ROLES yetkisi gereklidir.');
    }

    const currentRoles = this.roles.get(guildId) || [];
    const newPosition = roleData.position ?? currentRoles.length;

    // Hierarchy check: cannot create role at or above actor's highest role
    if (!canManage(guildObj, actor, { highestRolePosition: newPosition })) {
      throw new Error('Kendi en yüksek rolünüzden daha yüksek pozisyonda rol oluşturamazsınız.');
    }

    const role: Role = {
      id: generateId(),
      guildId,
      name: roleData.name,
      position: newPosition,
      permissions: roleData.permissions ? BigInt(roleData.permissions) : 0n
    };

    currentRoles.push(role);
    this.roles.set(guildId, currentRoles);
    return role;
  }

  /**
   * Sets channel overwrite with permission check.
   */
  public async setChannelOverwrite(
    channelId: string,
    actorId: string,
    overwrite: PermissionOverwrite
  ): Promise<void> {
    const channel = this.getChannel(channelId);
    if (!channel || !channel.guildId) throw new Error('Kanal bulunamadı.');

    const actorPerms = this.getChannelPermissions(channel.guildId, channelId, actorId);
    if (!hasPermission(actorPerms, Permissions.MANAGE_CHANNELS) && !hasPermission(actorPerms, Permissions.MANAGE_ROLES)) {
      throw new Error('Kanal izinlerini düzenlemek için MANAGE_CHANNELS yetkisi gereklidir.');
    }

    if (!channel.overwrites) channel.overwrites = [];
    const index = channel.overwrites.findIndex(
      (o) => o.targetId === overwrite.targetId && o.targetType === overwrite.targetType
    );

    if (index >= 0) {
      channel.overwrites[index] = overwrite;
    } else {
      channel.overwrites.push(overwrite);
    }
  }

  /**
   * Creates an invite code.
   */
  public createInvite(channelId: string, inviterId: string, maxUses: number = 0, expiresHours: number = 24): InviteEntity {
    const channel = this.getChannel(channelId);
    if (!channel || !channel.guildId) throw new Error('Kanal bulunamadı.');

    const perms = this.getChannelPermissions(channel.guildId, channelId, inviterId);
    if (!hasPermission(perms, Permissions.CREATE_INVITE)) {
      throw new Error('Davet oluşturma yetkiniz yok.');
    }

    // Cryptographic random 8-character base62 invite code
    const code = Math.random().toString(36).substring(2, 10);
    const invite: InviteEntity = {
      code,
      guildId: channel.guildId,
      channelId,
      inviterId,
      maxUses,
      uses: 0,
      expiresAt: expiresHours > 0 ? new Date(Date.now() + expiresHours * 3600 * 1000) : null,
      createdAt: new Date()
    };

    this.invites.set(code, invite);
    return invite;
  }

  /**
   * Joins a guild via invite code.
   */
  public joinViaInvite(code: string, userId: string): { guild: GuildEntity; channelId: string } {
    const invite = this.invites.get(code);
    if (!invite) throw new Error('Geçersiz davet bağlantısı.');

    if (invite.expiresAt && new Date() > invite.expiresAt) {
      throw new Error('Davet bağlantısının süresi dolmuş.');
    }

    if (invite.maxUses > 0 && invite.uses >= invite.maxUses) {
      throw new Error('Davet bağlantısı maksimum kullanım sınırına ulaşmış.');
    }

    const guild = this.guilds.get(invite.guildId);
    if (!guild) throw new Error('Sunucu bulunamadı.');

    const existingMember = this.getMember(invite.guildId, userId);
    if (existingMember) {
      return { guild, channelId: invite.channelId };
    }

    invite.uses++;

    const newMember: MemberEntity = {
      userId,
      guildId: invite.guildId,
      roleIds: [],
      nickname: null,
      joinedAt: new Date()
    };

    const members = this.members.get(invite.guildId) || [];
    members.push(newMember);
    this.members.set(invite.guildId, members);
    guild.memberCount++;

    return { guild, channelId: invite.channelId };
  }

  public getChannelPermissions(guildId: string, channelId: string, userId: string): bigint {
    const guildObj = this.getGuildAsObject(guildId);
    const member = this.getMember(guildId, userId);
    const channel = this.getChannel(channelId);

    if (!member || !channel) return 0n;

    return computeChannelPermissions(guildObj, member, channel);
  }

  private getGuildAsObject(guildId: string): Guild {
    const g = this.guilds.get(guildId);
    if (!g) throw new Error('Sunucu bulunamadı.');
    return {
      id: g.id,
      ownerId: g.ownerId,
      roles: this.getGuildRoles(guildId)
    };
  }

  private getBasePermissions(guildId: string, userId: string): bigint {
    const guildObj = this.getGuildAsObject(guildId);
    const member = this.getMember(guildId, userId);
    if (!member) return 0n;
    if (guildObj.ownerId === userId) return Permissions.ADMINISTRATOR;

    let perms = 0n;
    const everyone = guildObj.roles.find((r) => r.id === guildId);
    if (everyone) perms |= BigInt(everyone.permissions);

    for (const rId of member.roleIds) {
      const r = guildObj.roles.find((role) => role.id === rId);
      if (r) perms |= BigInt(r.permissions);
    }

    return perms;
  }
}
