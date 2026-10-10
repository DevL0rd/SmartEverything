import { z } from 'zod';
import { SNOWFLAKE } from './ids';
import { VOICE_SETTINGS } from './voice/settings';

export const TOKEN_SECRET = 'bot_token';

const MODES = ['allowlist', 'blocklist'] as const;

const CAPTURES = ['addressed', 'all'] as const;

const REACHES = ['channel', 'server'] as const;

const ids = (max: number): z.ZodDefault<z.ZodArray<typeof SNOWFLAKE>> =>
  z.array(SNOWFLAKE).max(max).default([]);

export const DISCORD_SETTINGS = z.object({
  message_content_intent: z.boolean().default(true),
  guild_members_intent: z.boolean().default(true),
  approved_roles: ids(100),
  servers_mode: z.enum(MODES).default('blocklist'),
  servers_allowed: ids(100),
  servers_blocked: ids(100),
  channels_mode: z.enum(MODES).default('blocklist'),
  channels_allowed: ids(1000),
  channels_blocked: ids(1000),
  reply_to_bot: z.boolean().default(true),
  match_names: z.boolean().default(true),
  names: z.array(z.string().trim().min(2).max(32)).max(10).default([]),
  activity_visibility: z.boolean().default(true),
  context_enabled: z.boolean().default(true),
  context_capture: z.enum(CAPTURES).default('all'),
  context_reach: z.enum(REACHES).default('server'),
  context_per_channel: z.number().int().min(1).max(100).default(50),
  context_include_bots: z.boolean().default(true),
  media_enabled: z.boolean().default(true),
  media_capture: z.enum(CAPTURES).default('all'),
  media_max_attachments: z.number().int().min(1).max(1000).default(500),
  media_ttl_minutes: z.number().int().min(1).max(60).default(30),
  media_max_file_bytes: z
    .number()
    .int()
    .min(1)
    .max(8 * 1024 * 1024)
    .default(2 * 1024 * 1024),
  ...VOICE_SETTINGS,
});

export type DiscordSettings = z.output<typeof DISCORD_SETTINGS>;
