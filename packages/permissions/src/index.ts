/**
 * 64-bit Bitmask RBAC Permission System for Strata
 */

export const Permissions = {
  CREATE_INVITE: 1n << 0n,
  KICK_MEMBERS: 1n << 1n,
  BAN_MEMBERS: 1n << 2n,
  ADMINISTRATOR: 1n << 3n,
  MANAGE_CHANNELS: 1n << 4n,
  MANAGE_GUILD: 1n << 5n,
  ADD_REACTIONS: 1n << 6n,
  VIEW_AUDIT_LOG: 1n << 7n,
  PRIORITY_SPEAKER: 1n << 8n,
  STREAM: 1n << 9n,
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  MANAGE_MESSAGES: 1n << 12n,
  EMBED_LINKS: 1n << 13n,
  ATTACH_FILES: 1n << 14n,
  READ_MESSAGE_HISTORY: 1n << 15n,
  MENTION_EVERYONE: 1n << 16n,
  USE_EXTERNAL_EMOJIS: 1n << 17n,
  CONNECT: 1n << 18n,
  SPEAK: 1n << 19n,
  MUTE_MEMBERS: 1n << 20n,
  DEAFEN_MEMBERS: 1n << 21n,
  MOVE_MEMBERS: 1n << 22n,
  USE_VAD: 1n << 23n,
  CHANGE_NICKNAME: 1n << 24n,
  MANAGE_NICKNAMES: 1n << 25n,
  MANAGE_ROLES: 1n << 26n,
  MANAGE_WEBHOOKS: 1n << 27n,
  MANAGE_EMOJIS: 1n << 28n,
  CREATE_PUBLIC_THREADS: 1n << 29n,
  CREATE_PRIVATE_THREADS: 1n << 30n,
  SEND_MESSAGES_IN_THREADS: 1n << 31n,
  MANAGE_THREADS: 1n << 32n,
  MODERATE_MEMBERS: 1n << 33n, // Timeout
  VIDEO: 1n << 34n
} as const;

export type PermissionKey = keyof typeof Permissions;

// Calculate ALL_PERMISSIONS bitmask
export const ALL_PERMISSIONS: bigint = Object.values(Permissions).reduce((acc, bit) => acc | bit, 0n);

export const DEFAULT_EVERYONE_PERMISSIONS: bigint =
  Permissions.VIEW_CHANNEL |
  Permissions.SEND_MESSAGES |
  Permissions.READ_MESSAGE_HISTORY |
  Permissions.ADD_REACTIONS |
  Permissions.EMBED_LINKS |
  Permissions.ATTACH_FILES |
  Permissions.CONNECT |
  Permissions.SPEAK |
  Permissions.USE_VAD |
  Permissions.CHANGE_NICKNAME;

export interface Role {
  id: string;
  guildId: string;
  name: string;
  position: number;
  permissions: bigint | string;
}

export interface PermissionOverwrite {
  targetId: string;
  targetType: 'role' | 'member';
  allow: bigint | string;
  deny: bigint | string;
}

export interface Channel {
  id: string;
  guildId: string | null;
  type: string;
  parentId?: string | null;
  permissionsSynced?: boolean;
  overwrites?: PermissionOverwrite[];
}

export interface GuildMember {
  userId: string;
  guildId: string;
  roleIds: string[];
  timeoutUntil?: Date | string | null;
}

export interface Guild {
  id: string;
  ownerId: string;
  roles: Role[];
}

function toBigInt(val: bigint | string | number | undefined): bigint {
  if (val === undefined || val === null) return 0n;
  if (typeof val === 'bigint') return val;
  return BigInt(val);
}

/**
 * Checks whether a given bitmask contains a specific permission.
 */
export function hasPermission(bitmask: bigint | string, permission: bigint): boolean {
  const mask = toBigInt(bitmask);
  if ((mask & Permissions.ADMINISTRATOR) === Permissions.ADMINISTRATOR) {
    return true;
  }
  return (mask & permission) === permission;
}

/**
 * Computes base guild-level permissions for a member.
 */
export function computeBasePermissions(guild: Guild, member: GuildMember): bigint {
  // 1. Owner has all permissions
  if (guild.ownerId === member.userId) {
    return ALL_PERMISSIONS;
  }

  // 2. Everyone role (role where id === guild.id)
  const everyoneRole = guild.roles.find((r) => r.id === guild.id);
  let permissions = everyoneRole ? toBigInt(everyoneRole.permissions) : 0n;

  // 3. User roles permissions (bitwise OR)
  for (const roleId of member.roleIds) {
    const role = guild.roles.find((r) => r.id === roleId);
    if (role) {
      permissions |= toBigInt(role.permissions);
    }
  }

  // 4. Administrator bypasses everything
  if ((permissions & Permissions.ADMINISTRATOR) === Permissions.ADMINISTRATOR) {
    return ALL_PERMISSIONS;
  }

  return permissions;
}

/**
 * Computes final effective permissions for a member in a specific channel.
 */
export function computeChannelPermissions(
  guild: Guild,
  member: GuildMember,
  channel: Channel,
  categoryOverwrites?: PermissionOverwrite[]
): bigint {
  // 1. Owner always has all permissions
  if (guild.ownerId === member.userId) {
    return ALL_PERMISSIONS;
  }

  // 2. Calculate base permissions
  const base = computeBasePermissions(guild, member);

  // 3. Administrator bypasses all channel overwrites
  if ((base & Permissions.ADMINISTRATOR) === Permissions.ADMINISTRATOR) {
    return ALL_PERMISSIONS;
  }

  // If DM channel, full access
  if (!channel.guildId) {
    return ALL_PERMISSIONS;
  }

  let permissions = base;

  // Choose active overwrites (synced with parent category or channel own)
  const overwrites =
    channel.permissionsSynced && categoryOverwrites && categoryOverwrites.length > 0
      ? categoryOverwrites
      : channel.overwrites || [];

  // 4a. Apply @everyone overwrite
  const everyoneOverwrite = overwrites.find((o) => o.targetType === 'role' && o.targetId === guild.id);
  if (everyoneOverwrite) {
    permissions &= ~toBigInt(everyoneOverwrite.deny);
    permissions |= toBigInt(everyoneOverwrite.allow);
  }

  // 4b. Apply role overwrites (accumulate all denies, then all allows)
  let roleDenies = 0n;
  let roleAllows = 0n;
  for (const roleId of member.roleIds) {
    const roleOverwrite = overwrites.find((o) => o.targetType === 'role' && o.targetId === roleId);
    if (roleOverwrite) {
      roleDenies |= toBigInt(roleOverwrite.deny);
      roleAllows |= toBigInt(roleOverwrite.allow);
    }
  }
  permissions &= ~roleDenies;
  permissions |= roleAllows;

  // 4c. Apply member-specific overwrite
  const memberOverwrite = overwrites.find((o) => o.targetType === 'member' && o.targetId === member.userId);
  if (memberOverwrite) {
    permissions &= ~toBigInt(memberOverwrite.deny);
    permissions |= toBigInt(memberOverwrite.allow);
  }

  // 5. Semantic Constraints:
  // - If VIEW_CHANNEL is denied, result is 0n!
  if ((permissions & Permissions.VIEW_CHANNEL) !== Permissions.VIEW_CHANNEL) {
    return 0n;
  }

  // - If text channel & no SEND_MESSAGES: drop ATTACH_FILES, EMBED_LINKS, MENTION_EVERYONE
  if ((permissions & Permissions.SEND_MESSAGES) !== Permissions.SEND_MESSAGES) {
    permissions &= ~Permissions.ATTACH_FILES;
    permissions &= ~Permissions.EMBED_LINKS;
    permissions &= ~Permissions.MENTION_EVERYONE;
  }

  // - If voice channel & no CONNECT: drop voice abilities
  if ((permissions & Permissions.CONNECT) !== Permissions.CONNECT) {
    permissions &= ~Permissions.SPEAK;
    permissions &= ~Permissions.STREAM;
    permissions &= ~Permissions.VIDEO;
    permissions &= ~Permissions.USE_VAD;
  }

  // - If member is timed out: only VIEW_CHANNEL and READ_MESSAGE_HISTORY remain!
  if (member.timeoutUntil) {
    const timeout = typeof member.timeoutUntil === 'string' ? new Date(member.timeoutUntil) : member.timeoutUntil;
    if (timeout.getTime() > Date.now()) {
      permissions &= Permissions.VIEW_CHANNEL | Permissions.READ_MESSAGE_HISTORY;
    }
  }

  return permissions;
}

/**
 * Checks role hierarchy: whether actor can manage target role or member.
 */
export function canManage(
  guild: Guild,
  actor: GuildMember,
  target: { highestRolePosition: number; userId?: string }
): boolean {
  if (guild.ownerId === actor.userId) return true;
  if (target.userId && guild.ownerId === target.userId) return false;

  const actorRoles = guild.roles.filter((r) => actor.roleIds.includes(r.id));
  const actorHighest = Math.max(0, ...actorRoles.map((r) => r.position));

  return actorHighest > target.highestRolePosition;
}
