import { z } from 'zod';
import { DiscordInputError } from '../errors';
import { SNOWFLAKE } from '../ids';
import {
  channel,
  define,
  guild,
  pagination,
  query,
  type Operation,
  ON_CHANNEL,
  ON_GUILD,
} from './kit';

const NAME = z.string().regex(/^[A-Za-z0-9_]{2,32}$/);
const EMOJI_IMAGE_LIMIT = 350_000;
const EMOJI_IMAGE = z
  .string()
  .max(EMOJI_IMAGE_LIMIT)
  .regex(/^data:image\/(png|jpeg|gif);base64,[A-Za-z0-9+/]+={0,2}$/);

export const ASK_COMMAND = 'ask';
export const ASK_COMMANDS: ReadonlySet<string> = new Set([ASK_COMMAND]);

export const GUILD_OPERATIONS: readonly Operation[] = [
  define(
    'read',
    {
      action: 'guild_get',
      description: 'Read guild metadata and approximate counts.',
      ...ON_GUILD,
    },
    guild,
    (a, c) => c.rest.get(`/guilds/${a.guildId}`, query({ with_counts: true })),
  ),
  define(
    'read',
    {
      action: 'audit_log',
      description: 'Read a bounded page of guild audit entries.',
      target: 'guild',
    },
    { ...guild, ...pagination, actionType: z.number().int().min(1).max(200).optional() },
    (a, c) =>
      c.rest.get(
        `/guilds/${a.guildId}/audit-logs`,
        query({ limit: a.limit, before: a.before, action_type: a.actionType }),
      ),
  ),
  define(
    'read',
    {
      action: 'invites_list',
      description: 'Read invites for the channel. Invite codes give access to the server.',
      ...ON_CHANNEL,
    },
    channel,
    (a, c) => c.rest.get(`/channels/${a.channelId}/invites`),
  ),
  define(
    'read',
    {
      action: 'commands_list',
      description: 'Read this bot’s guild application commands.',
      ...ON_GUILD,
    },
    guild,
    (a, c) => c.rest.get(`/applications/${c.applicationId}/guilds/${a.guildId}/commands`),
  ),
  define(
    'read',
    { action: 'emojis_list', description: 'Read guild emoji metadata.', ...ON_GUILD },
    guild,
    (a, c) => c.rest.get(`/guilds/${a.guildId}/emojis`),
  ),
  define(
    'read',
    {
      action: 'stickers_list',
      description: 'Read guild sticker metadata; uploads are not supported.',
      ...ON_GUILD,
    },
    guild,
    (a, c) => c.rest.get(`/guilds/${a.guildId}/stickers`),
  ),
  define(
    'change',
    {
      action: 'guild_edit',
      description: 'Change guild name, description or verification level.',
      ...ON_GUILD,
    },
    {
      ...guild,
      name: z.string().min(2).max(100).optional(),
      description: z.string().max(120).nullable().optional(),
      verificationLevel: z.number().int().min(0).max(4).optional(),
    },
    (a, c) =>
      c.rest.patch(`/guilds/${a.guildId}`, {
        name: a.name,
        description: a.description,
        verification_level: a.verificationLevel,
      }),
  ),
  define(
    'change',
    {
      action: 'invite_create',
      description: 'Create a bounded channel invite. This is not a bot installation invite.',
      ...ON_CHANNEL,
    },
    {
      ...channel,
      maxAgeSeconds: z.number().int().min(60).max(604800).default(3600),
      maxUses: z.number().int().min(1).max(100).default(1),
      temporary: z.boolean().default(false),
    },
    (a, c) =>
      c.rest.post(`/channels/${a.channelId}/invites`, {
        max_age: a.maxAgeSeconds,
        max_uses: a.maxUses,
        temporary: a.temporary,
        unique: true,
      }),
  ),
  define(
    'change',
    {
      action: 'command_register',
      description: `Register a /${ASK_COMMAND} command with a text option in this guild. No global replacement.`,
      ...ON_GUILD,
    },
    guild,
    (a, c) =>
      c.rest.post(`/applications/${c.applicationId}/guilds/${a.guildId}/commands`, {
        name: ASK_COMMAND,
        description: 'Ask the assistant',
        type: 1,
        options: [
          {
            name: 'text',
            description: 'Your request or answer',
            type: 3,
            required: true,
            max_length: 2000,
          },
        ],
        default_member_permissions: '0',
      }),
  ),
  define(
    'change',
    {
      action: 'emoji_create',
      description: 'Create an emoji from bounded image data; no URL fetching.',
      ...ON_GUILD,
    },
    { ...guild, name: NAME, image: EMOJI_IMAGE },
    (a, c) => c.rest.post(`/guilds/${a.guildId}/emojis`, { name: a.name, image: a.image }),
  ),
  define(
    'change',
    { action: 'emoji_rename', description: 'Rename a guild emoji.', ...ON_GUILD },
    { ...guild, emojiId: SNOWFLAKE, name: NAME },
    (a, c) => c.rest.patch(`/guilds/${a.guildId}/emojis/${a.emojiId}`, { name: a.name }),
  ),
  define(
    'change',
    {
      action: 'sticker_edit',
      description: 'Change a guild sticker’s name, description or tags.',
      ...ON_GUILD,
    },
    {
      ...guild,
      stickerId: SNOWFLAKE,
      name: z.string().min(2).max(30),
      description: z.string().min(2).max(100).nullable(),
      tags: z.string().min(1).max(200),
    },
    (a, c) =>
      c.rest.patch(`/guilds/${a.guildId}/stickers/${a.stickerId}`, {
        name: a.name,
        description: a.description,
        tags: a.tags,
      }),
  ),
  define(
    'remove',
    {
      action: 'invite_delete',
      description: 'Revoke an invite belonging to the specified channel.',
      ...ON_CHANNEL,
    },
    { ...channel, code: z.string().regex(/^[A-Za-z0-9_-]{2,100}$/) },
    async (a, c) => {
      const invites = z
        .array(z.looseObject({ code: z.string() }))
        .parse(await c.rest.get(`/channels/${a.channelId}/invites`));
      if (!invites.some((invite) => invite.code === a.code)) {
        throw new DiscordInputError('Invite does not belong to the channel');
      }
      return c.rest.delete(`/invites/${a.code}`);
    },
  ),
  define(
    'remove',
    {
      action: 'command_delete',
      description: 'Delete one of this bot’s guild commands.',
      ...ON_GUILD,
    },
    { ...guild, commandId: SNOWFLAKE },
    (a, c) =>
      c.rest.delete(`/applications/${c.applicationId}/guilds/${a.guildId}/commands/${a.commandId}`),
  ),
  define(
    'remove',
    { action: 'emoji_delete', description: 'Delete a guild emoji.', ...ON_GUILD },
    { ...guild, emojiId: SNOWFLAKE },
    (a, c) => c.rest.delete(`/guilds/${a.guildId}/emojis/${a.emojiId}`),
  ),
  define(
    'remove',
    { action: 'sticker_delete', description: 'Delete a guild sticker.', ...ON_GUILD },
    { ...guild, stickerId: SNOWFLAKE },
    (a, c) => c.rest.delete(`/guilds/${a.guildId}/stickers/${a.stickerId}`),
  ),
];
