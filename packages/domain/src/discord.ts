import { z } from 'zod';

export const DISCORD_STREAM = 'discord.status';

export const DISCORD_GATEWAY_STATES = [
  'offline',
  'connecting',
  'ready',
  'reconnecting',
  'disconnected',
  'error',
] as const;

export const DISCORD_CALL = z.strictObject({
  id: z.uuid(),
  guildId: z.string().max(40),
  channelId: z.string().max(40),
  channelName: z.string().max(100).nullable(),
  startedAt: z.iso.datetime({ offset: true }),
  people: z.number().int().nonnegative(),
  lines: z.number().int().nonnegative(),
  live: z.boolean(),
  muted: z.boolean(),
});

export type DiscordCall = z.output<typeof DISCORD_CALL>;

export const DISCORD_CALLS_MAX = 50;

export const DISCORD_STATUS = z.strictObject({
  gateway: z.enum(DISCORD_GATEWAY_STATES),
  detail: z.string().max(500).nullable(),
  botName: z.string().max(120).nullable(),
  botId: z.string().max(40).nullable(),
  serverCount: z.number().int().nonnegative(),
  droppedMessages: z.number().int().nonnegative(),
  calls: z.array(DISCORD_CALL).max(DISCORD_CALLS_MAX).default([]),
  voiceNotice: z.string().max(300).nullable().default(null),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type DiscordStatus = z.output<typeof DISCORD_STATUS>;
