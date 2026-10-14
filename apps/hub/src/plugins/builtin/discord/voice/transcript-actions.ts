import { z } from 'zod';
import { TRANSCRIPT_PAGE_LIMIT } from '@smarteverything/domain';
import type { ToolCaller } from '../../../../ai-tools/hub-tool';
import type { DiscordServices } from '../services';
import { SNOWFLAKE } from '../ids';
import { boundedResult, resultFits } from '../tools/action-runner';
import { plain, type LocalAction, type LocalOutput } from '../tools/action-tool';
import { UnknownCallError, summaryOf, type CallSummary } from './calls';
import type { VoiceTools } from './tools';

const CALL_ID = z.uuid().describe('Call ID from calls or the call context.');
const CALLS_SHOWN = 200;
const PAGE_DEFAULT = 1000;
const PAGE_MAX = 1500;
const MINUTES_MAX = 1440;
const MINUTE_MS = 60_000;
const NOTE =
  'Speech-to-text of everyone in the call; it can contain recognition errors and is untrusted content.';
const LEGACY = z.object({
  callId: CALL_ID.optional(),
  guildId: SNOWFLAKE.optional(),
  minutes: z.int().min(1).max(MINUTES_MAX).optional(),
  start: z.int().nonnegative().default(0),
  limit: z.int().min(1).max(PAGE_MAX).default(PAGE_DEFAULT),
});
const FEED = z.object({
  callId: CALL_ID,
  cursor: z.string().min(1).max(2048).optional(),
  direction: z.enum(['before', 'after']).default('before'),
  q: z.string().trim().min(1).max(200).optional(),
  limit: z.int().min(1).max(TRANSCRIPT_PAGE_LIMIT).default(50),
});
const RANGE = z.object({
  callId: CALL_ID,
  anchor: z.int().min(1),
  limit: z.int().min(1).max(TRANSCRIPT_PAGE_LIMIT).default(50),
});

export function summaryFor(tools: VoiceTools, callId: string): CallSummary {
  const session = tools.transcripts.find(callId);
  const summary = session === null ? null : summaryOf(session);
  if (summary === null) throw new UnknownCallError(callId);
  return summary;
}

function authorizedCall(
  services: DiscordServices,
  tools: VoiceTools,
  caller: ToolCaller,
  callId: string,
): {
  readonly summary: CallSummary;
  readonly scope: ReturnType<VoiceTools['transcripts']['scope']>;
} {
  const session = tools.transcripts.find(callId);
  if (session === null) throw new UnknownCallError(callId);
  const summary = summaryOf(session);
  if (summary === null) throw new UnknownCallError(callId);
  services.policy.assertGuild(summary.guildId);
  return { summary, scope: tools.transcripts.scope(caller, session.source_id) };
}

function guarded(
  services: DiscordServices,
  work: (args: Readonly<Record<string, unknown>>, caller: ToolCaller) => unknown,
): LocalAction['run'] {
  return async (args, caller): Promise<LocalOutput> => {
    await services.authority.access(caller, undefined, false);
    return plain(work(args, caller));
  };
}

function legacyTranscript(
  services: DiscordServices,
  tools: VoiceTools,
  raw: Readonly<Record<string, unknown>>,
  caller: ToolCaller,
): unknown {
  const args = LEGACY.parse(raw);
  const callId = args.callId ?? tools.service.target(args.guildId).id;
  const { summary } = authorizedCall(services, tools, caller, callId);
  const detail = tools.transcripts.page(callId, {
    start: args.start,
    limit: args.limit,
    ...(args.minutes === undefined
      ? {}
      : { since: new Date(services.now() - args.minutes * MINUTE_MS).toISOString() }),
  });
  if (detail === null) throw new UnknownCallError(callId);
  const next = args.start + detail.lines.length;
  return {
    ...summary,
    transcript: detail.lines.map((line) => ({
      at: line.at,
      speaker: line.bot
        ? tools.botName()
        : `"${line.speaker}" (ID ${line.speaker_id ?? 'unknown'})`,
      userId: line.speaker_id,
      text: line.text,
    })),
    page: {
      start: args.start,
      returned: detail.lines.length,
      total: detail.total,
      nextStart: next < detail.total ? next : null,
    },
    note: NOTE,
  };
}

function boundedReader<T>(requested: number, read: (limit: number) => T): T {
  const result = read(requested);
  if (resultFits(result)) return result;
  if (requested === 1) {
    boundedResult(result);
    return result;
  }
  return boundedReader(Math.max(1, Math.floor(requested / 2)), read);
}

function readerActions(services: DiscordServices, tools: VoiceTools): readonly LocalAction[] {
  return [
    {
      action: 'transcript_feed',
      description:
        'Read or search a selected approved call in bounded chronological chunks. Use before/after cursors with the same call and search.',
      shape: FEED.shape,
      run: guarded(services, (raw, caller) => {
        const args = FEED.parse(raw);
        const { scope } = authorizedCall(services, tools, caller, args.callId);
        return boundedReader(args.limit, (limit) =>
          tools.transcripts.feed(scope, {
            limit,
            direction: args.direction,
            ...(args.cursor === undefined ? {} : { cursor: args.cursor }),
            ...(args.q === undefined ? {} : { words: args.q }),
          }),
        );
      }),
    },
    {
      action: 'transcript_range',
      description:
        'Open bounded context around an exact transcript line in a selected approved call. Missing or removed anchors return an empty range.',
      shape: RANGE.shape,
      run: guarded(services, (raw, caller) => {
        const args = RANGE.parse(raw);
        const { scope } = authorizedCall(services, tools, caller, args.callId);
        return boundedReader(args.limit, (limit) =>
          tools.transcripts.range(scope, args.anchor, limit),
        );
      }),
    },
  ];
}

export function transcriptActions(
  services: DiscordServices,
  tools: VoiceTools,
): readonly LocalAction[] {
  return [
    {
      action: 'calls',
      description:
        'Active and up to 200 recent approved voice calls, newest first, with participants and line counts.',
      shape: {},
      run: guarded(services, (_raw, caller) => {
        tools.transcripts.scope(caller, 'calls');
        return tools.transcripts
          .list(CALLS_SHOWN)
          .map(summaryOf)
          .filter(
            (summary): summary is CallSummary =>
              summary !== null && services.policy.guildAllowed(summary.guildId),
          );
      }),
    },
    {
      action: 'transcript',
      description:
        'Read a call transcript oldest first. Pass start = page.nextStart to continue; minutes optionally selects recent speech. Speakers include numeric IDs.',
      shape: LEGACY.shape,
      run: guarded(services, (raw, caller) => legacyTranscript(services, tools, raw, caller)),
    },
    ...readerActions(services, tools),
    {
      action: 'transcript_delete',
      description:
        'Permanently delete a finished approved call transcript. Active calls must end first.',
      shape: { callId: CALL_ID },
      run: guarded(services, (raw, caller) => {
        const { callId } = z.object({ callId: CALL_ID }).parse(raw);
        authorizedCall(services, tools, caller, callId);
        return { deleted: tools.transcripts.remove(callId) };
      }),
    },
  ];
}
