import { z } from 'zod';
import { DiscordInputError } from '../errors';
import { SNOWFLAKE } from '../ids';
import {
  define,
  forwardPagination,
  guild,
  member,
  pagination,
  query,
  reason,
  shortName,
  type Operation,
  ON_GUILD,
} from './kit';

const PERMISSIONS = z.string().regex(/^\d{1,25}$/);
const DAY_SECONDS = 86_400;
const TIMEOUT_DAYS = 28;

const role = { ...guild, roleId: SNOWFLAKE };

const roleSettings = {
  name: shortName.optional(),
  permissions: PERMISSIONS.optional(),
  color: z.number().int().min(0).max(16777215).optional(),
  hoist: z.boolean().optional(),
  mentionable: z.boolean().optional(),
};

const roleBody = (a: {
  readonly name?: string | undefined;
  readonly permissions?: string | undefined;
  readonly color?: number | undefined;
  readonly hoist?: boolean | undefined;
  readonly mentionable?: boolean | undefined;
}): Readonly<Record<string, unknown>> => ({
  name: a.name,
  permissions: a.permissions,
  color: a.color,
  hoist: a.hoist,
  mentionable: a.mentionable,
});

export const MEMBER_OPERATIONS: readonly Operation[] = [
  define(
    'read',
    { action: 'member_get', description: 'Read one member and their role IDs.', ...ON_GUILD },
    member,
    (a, c) => c.rest.get(`/guilds/${a.guildId}/members/${a.userId}`),
  ),
  define(
    'read',
    {
      action: 'members_list',
      description: 'Read a bounded member page; Server Members intent is required.',
      ...ON_GUILD,
    },
    { ...guild, ...forwardPagination },
    (a, c) => c.rest.get(`/guilds/${a.guildId}/members`, query({ limit: a.limit, after: a.after })),
  ),
  define(
    'read',
    { action: 'bans_list', description: 'Read a bounded list of bans.', ...ON_GUILD },
    { ...guild, ...pagination },
    (a, c) => c.rest.get(`/guilds/${a.guildId}/bans`, query({ limit: a.limit, before: a.before })),
  ),
  define(
    'read',
    {
      action: 'roles_list',
      description: 'Read guild roles and permission bitfields.',
      target: 'guild',
    },
    guild,
    (a, c) => c.rest.get(`/guilds/${a.guildId}/roles`),
  ),
  define(
    'change',
    { action: 'member_nickname', description: 'Change a member nickname.', ...ON_GUILD },
    { ...member, nickname: z.string().max(32).nullable() },
    (a, c) => c.rest.patch(`/guilds/${a.guildId}/members/${a.userId}`, { nick: a.nickname }),
  ),
  define(
    'change',
    {
      action: 'role_create',
      description: 'Create a role, including explicit permission bits.',
      ...ON_GUILD,
    },
    { ...guild, ...roleSettings, name: shortName, permissions: PERMISSIONS.default('0') },
    (a, c) => c.rest.post(`/guilds/${a.guildId}/roles`, roleBody(a)),
  ),
  define(
    'change',
    { action: 'role_edit', description: 'Edit a role or its permissions.', ...ON_GUILD },
    { ...role, ...roleSettings },
    (a, c) => c.rest.patch(`/guilds/${a.guildId}/roles/${a.roleId}`, roleBody(a)),
  ),
  define(
    'change',
    { action: 'role_position', description: 'Move a role in the hierarchy.', ...ON_GUILD },
    { ...role, position: z.number().int().min(0).max(1000) },
    (a, c) => c.rest.patch(`/guilds/${a.guildId}/roles`, [{ id: a.roleId, position: a.position }]),
  ),
  define(
    'change',
    { action: 'member_role_add', description: 'Assign a guild role.', ...ON_GUILD },
    { ...member, roleId: SNOWFLAKE },
    (a, c) => c.rest.put(`/guilds/${a.guildId}/members/${a.userId}/roles/${a.roleId}`),
  ),
  define(
    'change',
    {
      action: 'voice_member_edit',
      description: 'Move, disconnect, mute or deafen a member; no audio capture or playback.',
      target: 'guild',
    },
    {
      ...member,
      channelId: SNOWFLAKE.nullable().optional(),
      mute: z.boolean().optional(),
      deaf: z.boolean().optional(),
    },
    async (a, c) => {
      if (a.channelId !== undefined && a.channelId !== null) {
        const destination = await c.channels.guildChannel(a.channelId);
        if (destination.guild_id !== a.guildId) {
          throw new DiscordInputError('Voice destination is in another guild');
        }
      }
      return c.rest.patch(`/guilds/${a.guildId}/members/${a.userId}`, {
        channel_id: a.channelId,
        mute: a.mute,
        deaf: a.deaf,
      });
    },
  ),
  define(
    'remove',
    {
      action: 'member_timeout',
      description: 'Set or clear a member timeout. Discord hierarchy applies.',
      ...ON_GUILD,
    },
    {
      ...member,
      durationSeconds: z
        .number()
        .int()
        .min(0)
        .max(TIMEOUT_DAYS * DAY_SECONDS),
      reason,
    },
    (a, c) =>
      c.rest.patch(
        `/guilds/${a.guildId}/members/${a.userId}`,
        {
          communication_disabled_until:
            a.durationSeconds === 0
              ? null
              : new Date(Date.now() + a.durationSeconds * 1000).toISOString(),
        },
        a.reason,
      ),
  ),
  define(
    'remove',
    { action: 'member_kick', description: 'Kick a member. No automatic DM is sent.', ...ON_GUILD },
    { ...member, reason },
    (a, c) => c.rest.delete(`/guilds/${a.guildId}/members/${a.userId}`, a.reason),
  ),
  define(
    'remove',
    {
      action: 'member_ban',
      description: 'Ban a member, optionally delete up to seven days of messages.',
      ...ON_GUILD,
    },
    { ...member, deleteMessageSeconds: z.number().int().min(0).max(604800).default(0), reason },
    (a, c) =>
      c.rest.put(
        `/guilds/${a.guildId}/bans/${a.userId}`,
        { delete_message_seconds: a.deleteMessageSeconds },
        a.reason,
      ),
  ),
  define(
    'remove',
    { action: 'member_unban', description: 'Remove a guild ban.', ...ON_GUILD },
    { ...member, reason },
    (a, c) => c.rest.delete(`/guilds/${a.guildId}/bans/${a.userId}`, a.reason),
  ),
  define(
    'remove',
    { action: 'role_delete', description: 'Delete a role.', ...ON_GUILD },
    role,
    (a, c) => c.rest.delete(`/guilds/${a.guildId}/roles/${a.roleId}`),
  ),
  define(
    'remove',
    { action: 'member_role_remove', description: 'Remove a member role.', ...ON_GUILD },
    { ...member, roleId: SNOWFLAKE },
    (a, c) => c.rest.delete(`/guilds/${a.guildId}/members/${a.userId}/roles/${a.roleId}`),
  ),
];
