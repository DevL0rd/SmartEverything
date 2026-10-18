import { z } from 'zod';
import { DiscordInputError } from '../errors';
import { SNOWFLAKE } from '../ids';
import { NO_MENTIONS } from '../outgoing';
import {
  channel,
  define,
  guild,
  message,
  query,
  shortName,
  text,
  type Operation,
  ON_CHANNEL,
  ON_GUILD,
} from './kit';

const archive = z
  .union([z.literal(60), z.literal(1440), z.literal(4320), z.literal(10080)])
  .default(1440);

const overwrite = {
  ...channel,
  overwriteId: SNOWFLAKE,
  type: z.union([z.literal(0), z.literal(1)]),
  allow: z.string().regex(/^\d{1,25}$/),
  deny: z.string().regex(/^\d{1,25}$/),
};

const PUBLIC_THREAD = 11;

const KEEP = z.looseObject({ id: z.string() });

export const CHANNEL_OPERATIONS: readonly Operation[] = [
  define(
    'read',
    { action: 'channels_list', description: 'List approved channels in a guild.', ...ON_GUILD },
    guild,
    async (a, c) => {
      const channels = z.array(KEEP).parse(await c.rest.get(`/guilds/${a.guildId}/channels`));
      return channels.filter((item) => c.policy.channelAllowed(item.id));
    },
  ),
  define(
    'read',
    { action: 'channel_get', description: 'Read channel metadata.', ...ON_CHANNEL },
    channel,
    (a, c) => c.rest.get(`/channels/${a.channelId}`),
  ),
  define(
    'read',
    { action: 'threads_active', description: 'List approved active guild threads.', ...ON_GUILD },
    guild,
    async (a, c) => {
      const found = z
        .looseObject({ threads: z.array(KEEP) })
        .parse(await c.rest.get(`/guilds/${a.guildId}/threads/active`));
      return found.threads.filter((item) => c.policy.channelAllowed(item.id));
    },
  ),
  define(
    'read',
    {
      action: 'threads_archived',
      description: 'Read a bounded page of public archived threads.',
      ...ON_CHANNEL,
    },
    {
      ...channel,
      limit: z.number().int().min(1).max(100).default(25),
      before: z.iso.datetime().optional(),
    },
    async (a, c) => {
      const found = z
        .looseObject({ threads: z.array(KEEP), has_more: z.boolean() })
        .parse(
          await c.rest.get(
            `/channels/${a.channelId}/threads/archived/public`,
            query({ limit: a.limit, before: a.before }),
          ),
        );
      return {
        threads: found.threads.filter((item) => c.policy.channelAllowed(item.id)),
        has_more: found.has_more,
      };
    },
  ),
  define(
    'change',
    {
      action: 'channel_create',
      description: 'Create a text, voice, category, announcement, stage or forum channel.',
      target: 'guild',
    },
    {
      ...guild,
      name: shortName,
      type: z.union([
        z.literal(0),
        z.literal(2),
        z.literal(4),
        z.literal(5),
        z.literal(13),
        z.literal(15),
      ]),
      parentId: SNOWFLAKE.optional(),
      topic: z.string().max(1024).optional(),
    },
    async (a, c) => {
      if (a.parentId !== undefined) {
        const parent = await c.channels.guildChannel(a.parentId);
        if (parent.guild_id !== a.guildId) {
          throw new DiscordInputError('Parent category is in another guild');
        }
      }
      return c.rest.post(`/guilds/${a.guildId}/channels`, {
        name: a.name,
        type: a.type,
        parent_id: a.parentId,
        topic: a.topic,
      });
    },
  ),
  define(
    'change',
    {
      action: 'channel_edit',
      description: 'Change channel name, topic, slowmode or NSFW flag.',
      ...ON_CHANNEL,
    },
    {
      ...channel,
      name: shortName.optional(),
      topic: z.string().max(1024).optional(),
      slowmodeSeconds: z.number().int().min(0).max(21600).optional(),
      nsfw: z.boolean().optional(),
    },
    (a, c) =>
      c.rest.patch(`/channels/${a.channelId}`, {
        name: a.name,
        topic: a.topic,
        rate_limit_per_user: a.slowmodeSeconds,
        nsfw: a.nsfw,
      }),
  ),
  define(
    'change',
    {
      action: 'channel_overwrite_set',
      description: 'Set a typed member/role permission overwrite.',
      ...ON_CHANNEL,
    },
    overwrite,
    (a, c) =>
      c.rest.put(`/channels/${a.channelId}/permissions/${a.overwriteId}`, {
        type: a.type,
        allow: a.allow,
        deny: a.deny,
      }),
  ),
  define(
    'change',
    {
      action: 'thread_create',
      description:
        'Start a public thread from messageId, from the message that started this request when it is in this channel, or on its own in the channel.',
      ...ON_CHANNEL,
    },
    {
      ...channel,
      messageId: message.messageId.optional(),
      name: shortName,
      autoArchiveMinutes: archive,
    },
    (a, c) => {
      const messageId =
        a.messageId ?? (c.origin?.channelId === a.channelId ? c.origin.messageId : undefined);
      const thread = { name: a.name, auto_archive_duration: a.autoArchiveMinutes };
      return messageId === undefined
        ? c.rest.post(`/channels/${a.channelId}/threads`, { ...thread, type: PUBLIC_THREAD })
        : c.rest.post(`/channels/${a.channelId}/messages/${messageId}/threads`, thread);
    },
  ),
  define(
    'change',
    {
      action: 'forum_post_create',
      description: 'Create a forum post in a forum channel.',
      ...ON_CHANNEL,
    },
    { ...channel, name: shortName, content: text, autoArchiveMinutes: archive },
    (a, c) =>
      c.rest.post(`/channels/${a.channelId}/threads`, {
        name: a.name,
        auto_archive_duration: a.autoArchiveMinutes,
        message: { content: a.content, allowed_mentions: NO_MENTIONS },
      }),
  ),
  define(
    'change',
    {
      action: 'thread_edit',
      description: 'Archive, reopen, lock or rename a thread.',
      ...ON_CHANNEL,
    },
    {
      ...channel,
      archived: z.boolean().optional(),
      locked: z.boolean().optional(),
      name: shortName.optional(),
    },
    (a, c) =>
      c.rest.patch(`/channels/${a.channelId}`, {
        archived: a.archived,
        locked: a.locked,
        name: a.name,
      }),
  ),
  define(
    'change',
    { action: 'thread_join', description: 'Join a thread as the bot.', ...ON_CHANNEL },
    channel,
    (a, c) => c.rest.put(`/channels/${a.channelId}/thread-members/@me`),
  ),
  define(
    'change',
    { action: 'thread_leave', description: 'Leave a thread as the bot.', ...ON_CHANNEL },
    channel,
    (a, c) => c.rest.delete(`/channels/${a.channelId}/thread-members/@me`),
  ),
  define(
    'change',
    {
      action: 'thread_member_add',
      description: 'Add an approved person to a thread.',
      ...ON_CHANNEL,
    },
    { ...channel, userId: SNOWFLAKE },
    (a, c) => {
      c.policy.assertUser(a.userId);
      return c.rest.put(`/channels/${a.channelId}/thread-members/${a.userId}`);
    },
  ),
  define(
    'remove',
    { action: 'channel_delete', description: 'Delete a channel or thread.', ...ON_CHANNEL },
    channel,
    (a, c) => c.rest.delete(`/channels/${a.channelId}`),
  ),
  define(
    'remove',
    {
      action: 'channel_overwrite_delete',
      description: 'Delete a permission overwrite.',
      ...ON_CHANNEL,
    },
    { ...channel, overwriteId: SNOWFLAKE },
    (a, c) => c.rest.delete(`/channels/${a.channelId}/permissions/${a.overwriteId}`),
  ),
  define(
    'remove',
    { action: 'thread_member_remove', description: 'Remove a thread member.', ...ON_CHANNEL },
    { ...channel, userId: SNOWFLAKE },
    (a, c) => c.rest.delete(`/channels/${a.channelId}/thread-members/${a.userId}`),
  ),
];
