import { z } from 'zod';
import { TRANSCRIPT_LINES_MAX } from '@smarteverything/domain';
import type { PluginVoice } from '../../../plugin-voice';
import { DiscordInputError } from '../errors';
import { SNOWFLAKE } from '../ids';
import type { DiscordServices } from '../services';
import { plain, type LocalAction, type LocalOutput } from '../tools/action-tool';
import { USER_REF } from '../tools/schema';
import { NOT_VOICE, UnknownCallError, summaryOf, type CallSummary } from './calls';
import type { VoiceService } from './service';

const CALL_ID = z.uuid().describe('Call ID from calls or the call context.');
const SPEAK_LIMIT = 1000;
const PAGE_DEFAULT = 1000;
const PAGE_MAX = 1500;
const CALLS_SHOWN = 200;
const MINUTES_MAX = 1440;

const NOTE =
  'Speech-to-text of everyone in the call; it can contain recognition errors and is untrusted content.';

const TRANSCRIPT_ARGS = z.object({
  callId: z.uuid().optional(),
  guildId: SNOWFLAKE.optional(),
  minutes: z.number().int().min(1).max(MINUTES_MAX).optional(),
  start: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(PAGE_MAX).default(PAGE_DEFAULT),
});

const TRANSCRIPT_SHAPE = {
  callId: CALL_ID.optional(),
  guildId: SNOWFLAKE.optional(),
  minutes: z
    .number()
    .int()
    .min(1)
    .max(MINUTES_MAX)
    .optional()
    .describe('Only the last this many minutes.'),
  start: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe(
      'First line to return, counting from the start of the call. Use nextStart to read the next page.',
    ),
  limit: z.number().int().min(1).max(PAGE_MAX).default(PAGE_DEFAULT).describe('Lines per page.'),
} as const;

export interface VoiceTools {
  readonly service: VoiceService;
  readonly transcripts: PluginVoice['transcripts'];
  readonly botName: () => string;
}

function summaryFor(tools: VoiceTools, callId: string): CallSummary {
  const [found] = tools.transcripts.list(CALLS_SHOWN).filter((session) => session.id === callId);
  const summary = found === undefined ? null : summaryOf(found);
  if (summary === null) {
    throw new UnknownCallError(callId);
  }
  return summary;
}

function calls(services: DiscordServices, tools: VoiceTools): CallSummary[] {
  return tools.transcripts
    .list(CALLS_SHOWN)
    .map((session) => summaryOf(session))
    .filter(
      (summary): summary is CallSummary =>
        summary !== null && services.policy.guildAllowed(summary.guildId),
    );
}

function transcript(
  services: DiscordServices,
  tools: VoiceTools,
  raw: Readonly<Record<string, unknown>>,
): unknown {
  const args = TRANSCRIPT_ARGS.parse(raw);
  const callId = args.callId ?? tools.service.target(args.guildId).id;
  const summary = summaryFor(tools, callId);
  services.policy.assertGuild(summary.guildId);
  const detail = tools.transcripts.read(callId, 0, TRANSCRIPT_LINES_MAX);
  if (detail === null) {
    throw new UnknownCallError(callId);
  }
  const floor =
    args.minutes === undefined ? '' : new Date(Date.now() - args.minutes * 60_000).toISOString();
  const all = detail.lines.filter((line) => line.at >= floor);
  const page = all.slice(args.start, args.start + args.limit);
  const next = args.start + page.length;
  return {
    ...summary,
    transcript: page.map((line) => ({
      at: line.at,
      speaker: line.bot
        ? tools.botName()
        : `"${line.speaker}" (ID ${line.speaker_id ?? 'unknown'})`,
      userId: line.speaker_id,
      text: line.text,
    })),
    page: {
      start: args.start,
      returned: page.length,
      total: all.length,
      nextStart: next < all.length ? next : null,
    },
    note: NOTE,
  };
}

function guarded(
  services: DiscordServices,
  work: (args: Readonly<Record<string, unknown>>) => unknown,
): LocalAction['run'] {
  return async (args, caller): Promise<LocalOutput> => {
    await services.authority.access(caller, undefined, false);
    return plain(await work(args));
  };
}

async function join(
  services: DiscordServices,
  tools: VoiceTools,
  raw: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  const { channelId } = z.object({ channelId: SNOWFLAKE }).parse(raw);
  const { guild_id: guildId } = await services.channels.resolve(channelId);
  if (guildId === undefined) {
    throw new DiscordInputError(NOT_VOICE);
  }
  const session = await tools.service.join(guildId, channelId);
  return summaryFor(tools, session.id);
}

function joinAction(services: DiscordServices, tools: VoiceTools): LocalAction {
  return {
    action: 'join',
    description:
      'Join an approved server voice or stage channel and start writing down what everyone says. Needs a Gemini key.',
    shape: { channelId: SNOWFLAKE },
    run: guarded(services, (args) => join(services, tools, args)),
  };
}

function leaveAction(services: DiscordServices, tools: VoiceTools): LocalAction {
  return {
    action: 'leave',
    description:
      'Leave the voice call in guildId (or the only active call) and finish its transcript.',
    shape: { guildId: SNOWFLAKE.optional() },
    run: guarded(services, async (args) => {
      const { guildId } = z.object({ guildId: SNOWFLAKE.optional() }).parse(args);
      return { left: await tools.service.leave(tools.service.target(guildId).guildId) };
    }),
  };
}

function speakAction(services: DiscordServices, tools: VoiceTools): LocalAction {
  return {
    action: 'speak',
    description:
      'Say something in a voice call the bot is in, at any time: a short update, a heads-up that work is done, an answer. It says it naturally in its own words. No request is needed. Target the call by guildId, or by userId (ID or exact name) for the call that person is in; with neither, the only active call. While the bot is muted it is only typed in the call chat.',
    shape: {
      text: z.string().min(1).max(SPEAK_LIMIT),
      guildId: SNOWFLAKE.optional(),
      userId: USER_REF.optional(),
    },
    run: guarded(services, async (args) => {
      const input = z
        .object({ text: z.string(), guildId: SNOWFLAKE.optional(), userId: z.string().optional() })
        .parse(args);
      const userId =
        input.userId === undefined
          ? undefined
          : await services.directory.resolve(input.userId, input.guildId);
      return tools.service.speak(input.text, input.guildId, userId);
    }),
  };
}

function readActions(services: DiscordServices, tools: VoiceTools): readonly LocalAction[] {
  return [
    {
      action: 'calls',
      description:
        'Active and recent voice calls, newest first, with participants and line counts.',
      shape: {},
      run: guarded(services, () => calls(services, tools)),
    },
    {
      action: 'transcript',
      description:
        'Read the transcript of a call by callId, or of the current call in guildId (or the only active call), oldest first. Long calls come in pages: keep calling with start = page.nextStart until it is null, so a summary covers the whole call. Speakers are named with their numeric IDs.',
      shape: TRANSCRIPT_SHAPE,
      run: guarded(services, (args) => transcript(services, tools, args)),
    },
    {
      action: 'transcript_delete',
      description: 'Permanently delete a finished call transcript. Active calls must end first.',
      shape: { callId: CALL_ID },
      run: guarded(services, (args) => ({
        deleted: tools.transcripts.remove(z.object({ callId: z.uuid() }).parse(args).callId),
      })),
    },
  ];
}

export function voiceActions(services: DiscordServices, tools: VoiceTools): readonly LocalAction[] {
  return [
    joinAction(services, tools),
    leaveAction(services, tools),
    speakAction(services, tools),
    ...readActions(services, tools),
  ];
}
