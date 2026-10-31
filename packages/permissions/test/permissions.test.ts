import { describe, it, expect } from 'vitest';
import {
  Permissions,
  ALL_PERMISSIONS,
  DEFAULT_EVERYONE_PERMISSIONS,
  computeBasePermissions,
  computeChannelPermissions,
  canManage,
  hasPermission,
  type Guild,
  type GuildMember,
  type Channel
} from '../src/index.js';

describe('Permissions Package — 64-bit Bitmask RBAC Tests', () => {
  const guild: Guild = {
    id: 'guild_100',
    ownerId: 'usr_owner',
    roles: [
      { id: 'guild_100', guildId: 'guild_100', name: '@everyone', position: 0, permissions: DEFAULT_EVERYONE_PERMISSIONS },
      { id: 'role_mod', guildId: 'guild_100', name: 'Moderator', position: 10, permissions: Permissions.MANAGE_MESSAGES | Permissions.KICK_MEMBERS },
      { id: 'role_admin', guildId: 'guild_100', name: 'Admin', position: 20, permissions: Permissions.ADMINISTRATOR }
    ]
  };

  it('Owner has ALL_PERMISSIONS unconditionally', () => {
    const ownerMember: GuildMember = { userId: 'usr_owner', guildId: 'guild_100', roleIds: [] };
    const perms = computeBasePermissions(guild, ownerMember);
    expect(perms).toBe(ALL_PERMISSIONS);
    expect(hasPermission(perms, Permissions.ADMINISTRATOR)).toBe(true);
    expect(hasPermission(perms, Permissions.BAN_MEMBERS)).toBe(true);
  });

  it('Administrator role bypasses all channel overwrites', () => {
    const adminMember: GuildMember = { userId: 'usr_admin', guildId: 'guild_100', roleIds: ['role_admin'] };
    const channel: Channel = {
      id: 'chan_secret',
      guildId: 'guild_100',
      type: 'GUILD_TEXT',
      overwrites: [
        {
          targetId: 'guild_100',
          targetType: 'role',
          allow: 0n,
          deny: Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES
        }
      ]
    };

    const finalPerms = computeChannelPermissions(guild, adminMember, channel);
    expect(finalPerms).toBe(ALL_PERMISSIONS);
  });

  it('Overwrites: Denying VIEW_CHANNEL results in 0n permissions', () => {
    const regularMember: GuildMember = { userId: 'usr_normal', guildId: 'guild_100', roleIds: [] };
    const channel: Channel = {
      id: 'chan_hidden',
      guildId: 'guild_100',
      type: 'GUILD_TEXT',
      overwrites: [
        {
          targetId: 'guild_100',
          targetType: 'role',
          allow: 0n,
          deny: Permissions.VIEW_CHANNEL
        }
      ]
    };

    const perms = computeChannelPermissions(guild, regularMember, channel);
    expect(perms).toBe(0n);
    expect(hasPermission(perms, Permissions.VIEW_CHANNEL)).toBe(false);
  });

  it('Overwrites: Member-specific overwrite overrides role and @everyone overwrite', () => {
    const member: GuildMember = { userId: 'usr_vip', guildId: 'guild_100', roleIds: [] };
    const channel: Channel = {
      id: 'chan_vip_only',
      guildId: 'guild_100',
      type: 'GUILD_TEXT',
      overwrites: [
        { targetId: 'guild_100', targetType: 'role', allow: 0n, deny: Permissions.VIEW_CHANNEL },
        { targetId: 'usr_vip', targetType: 'member', allow: Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES, deny: 0n }
      ]
    };

    const perms = computeChannelPermissions(guild, member, channel);
    expect(hasPermission(perms, Permissions.VIEW_CHANNEL)).toBe(true);
    expect(hasPermission(perms, Permissions.SEND_MESSAGES)).toBe(true);
  });

  it('Semantic Constraints: Text channel without SEND_MESSAGES drops attachments & embed & mention', () => {
    const member: GuildMember = { userId: 'usr_read_only', guildId: 'guild_100', roleIds: [] };
    const channel: Channel = {
      id: 'chan_announcements',
      guildId: 'guild_100',
      type: 'GUILD_TEXT',
      overwrites: [
        {
          targetId: 'guild_100',
          targetType: 'role',
          allow: Permissions.VIEW_CHANNEL | Permissions.ATTACH_FILES | Permissions.EMBED_LINKS,
          deny: Permissions.SEND_MESSAGES
        }
      ]
    };

    const perms = computeChannelPermissions(guild, member, channel);
    expect(hasPermission(perms, Permissions.VIEW_CHANNEL)).toBe(true);
    expect(hasPermission(perms, Permissions.SEND_MESSAGES)).toBe(false);
    expect(hasPermission(perms, Permissions.ATTACH_FILES)).toBe(false);
    expect(hasPermission(perms, Permissions.EMBED_LINKS)).toBe(false);
  });

  it('Semantic Constraints: Timeout reduces permissions to only VIEW_CHANNEL & READ_MESSAGE_HISTORY', () => {
    const member: GuildMember = {
      userId: 'usr_timed_out',
      guildId: 'guild_100',
      roleIds: ['role_mod'],
      timeoutUntil: new Date(Date.now() + 600_000) // 10 minutes in the future
    };
    const channel: Channel = {
      id: 'chan_general',
      guildId: 'guild_100',
      type: 'GUILD_TEXT'
    };

    const perms = computeChannelPermissions(guild, member, channel);
    expect(hasPermission(perms, Permissions.VIEW_CHANNEL)).toBe(true);
    expect(hasPermission(perms, Permissions.READ_MESSAGE_HISTORY)).toBe(true);
    expect(hasPermission(perms, Permissions.SEND_MESSAGES)).toBe(false);
    expect(hasPermission(perms, Permissions.MANAGE_MESSAGES)).toBe(false);
  });

  it('Role Hierarchy: Actor can only manage targets with lower role position', () => {
    const modActor: GuildMember = { userId: 'usr_mod', guildId: 'guild_100', roleIds: ['role_mod'] }; // position 10
    const regularTarget = { highestRolePosition: 0, userId: 'usr_normal' };
    const adminTarget = { highestRolePosition: 20, userId: 'usr_admin' };
    const ownerTarget = { highestRolePosition: 99, userId: 'usr_owner' };

    expect(canManage(guild, modActor, regularTarget)).toBe(true);
    expect(canManage(guild, modActor, adminTarget)).toBe(false);
    expect(canManage(guild, modActor, ownerTarget)).toBe(false);

    // Owner can manage everyone
    const ownerActor: GuildMember = { userId: 'usr_owner', guildId: 'guild_100', roleIds: [] };
    expect(canManage(guild, ownerActor, adminTarget)).toBe(true);
  });
});
