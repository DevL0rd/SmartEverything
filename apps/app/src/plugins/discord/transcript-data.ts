import { z } from 'zod';
import {
  TRANSCRIPT_PAGE,
  TRANSCRIPT_RANGE,
  type TranscriptPage,
  type TranscriptRange,
} from '@smarteverything/domain';
import { callPluginTool } from '../../api/plugins';
import { transcriptSourceKey, type TranscriptFeedPort } from '../../components/transcript-feed';
import { DISCORD_PLUGIN } from './discord-data';

const CALL = z.strictObject({
  callId: z.uuid(),
  live: z.boolean(),
  guildId: z.string(),
  channelId: z.string(),
  channelName: z.string().nullable(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  participants: z.array(z.string()),
  lines: z.int().nonnegative(),
});
export type TranscriptCall = z.output<typeof CALL>;
export const DISCORD_CALLS_KEY = transcriptSourceKey({ source: 'plugin', scope: DISCORD_PLUGIN });
const CALLS = z.object({ result: z.array(CALL).max(200) });
const PAGE = z.object({ result: TRANSCRIPT_PAGE });
const RANGE = z.object({ result: TRANSCRIPT_RANGE });
const DELETED = z.object({ result: z.object({ deleted: z.boolean() }) });

export async function readDiscordCalls(): Promise<readonly TranscriptCall[]> {
  return CALLS.parse((await callPluginTool(DISCORD_PLUGIN, 'voice', { action: 'calls' })).result)
    .result;
}

export function discordTranscriptPort(callId: string): TranscriptFeedPort {
  return {
    source: 'plugin',
    scope: DISCORD_PLUGIN,
    selection: callId,
    read: async (request): Promise<TranscriptPage> =>
      PAGE.parse(
        (
          await callPluginTool(DISCORD_PLUGIN, 'voice', {
            action: 'transcript_feed',
            callId,
            limit: request.limit,
            direction: request.direction,
            ...(request.cursor === undefined ? {} : { cursor: request.cursor }),
            ...(request.words === '' ? {} : { q: request.words }),
          })
        ).result,
      ).result,
    range: async (anchor, limit): Promise<TranscriptRange> =>
      RANGE.parse(
        (
          await callPluginTool(DISCORD_PLUGIN, 'voice', {
            action: 'transcript_range',
            callId,
            anchor,
            limit,
          })
        ).result,
      ).result,
  };
}

export async function deleteDiscordTranscript(callId: string): Promise<void> {
  const deleted = DELETED.parse(
    (await callPluginTool(DISCORD_PLUGIN, 'voice', { action: 'transcript_delete', callId })).result,
  ).result.deleted;
  if (!deleted) throw new DiscordTranscriptDeleteError(callId);
}

class DiscordTranscriptDeleteError extends Error {
  override readonly name = 'DiscordTranscriptDeleteError';

  constructor(readonly callId: string) {
    super(`The Discord call ${callId} is still active or its transcript was removed.`);
  }
}
