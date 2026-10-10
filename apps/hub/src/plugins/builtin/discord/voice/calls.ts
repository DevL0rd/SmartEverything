import { z } from 'zod';
import type { TranscriptSession } from '@smarteverything/domain';
import { SNOWFLAKE } from '../ids';

export const NOT_VOICE = 'That is not a server voice or stage channel';

export const CALL_TITLE_PREFIX = 'Discord call · #';

const CALL_KEY = /^discord:(\d{17,20}):(\d{17,20}):\d+$/;

const CALL_SUMMARY = z.strictObject({
  callId: z.uuid(),
  live: z.boolean(),
  guildId: SNOWFLAKE,
  channelId: SNOWFLAKE,
  channelName: z.string().nullable(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  participants: z.array(z.string()),
  lines: z.number().int().nonnegative(),
});

export type CallSummary = z.output<typeof CALL_SUMMARY>;

export class UnknownCallError extends Error {
  override readonly name = 'UnknownCallError';

  constructor(readonly callId: string) {
    super(`No such call: ${callId}`);
  }
}

export function summaryOf(session: TranscriptSession): CallSummary | null {
  const match = CALL_KEY.exec(session.source_id);
  const [, guildId, channelId] = match ?? [];
  if (guildId === undefined || channelId === undefined) {
    return null;
  }
  return CALL_SUMMARY.parse({
    callId: session.id,
    live: session.ended_at === null,
    guildId,
    channelId,
    channelName: session.title.startsWith(CALL_TITLE_PREFIX)
      ? session.title.slice(CALL_TITLE_PREFIX.length)
      : null,
    startedAt: session.started_at,
    endedAt: session.ended_at,
    participants: session.participants,
    lines: session.line_count,
  });
}

export function callKey(guildId: string, channelId: string, startedAt: number): string {
  return `discord:${guildId}:${channelId}:${String(startedAt)}`;
}
