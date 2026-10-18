import { z } from 'zod';
import type { PluginVoice } from '../../../plugin-voice';
import { DiscordInputError } from '../errors';
import { SNOWFLAKE } from '../ids';
import type { DiscordServices } from '../services';
import { plain, type LocalAction, type LocalOutput } from '../tools/action-tool';
import { USER_REF } from '../tools/schema';
import { NOT_VOICE } from './calls';
import { transcriptActions, summaryFor } from './transcript-actions';
import type { VoiceService } from './service';

const SPEAK_LIMIT = 1000;

export interface VoiceTools {
  readonly service: VoiceService;
  readonly transcripts: PluginVoice['transcripts'];
  readonly botName: () => string;
}

function guarded(
  services: DiscordServices,
  work: (args: Readonly<Record<string, unknown>>) => unknown,
): LocalAction['run'] {
  return async (args, caller): Promise<LocalOutput> => {
    await services.authority.access(caller, undefined);
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

export function voiceActions(services: DiscordServices, tools: VoiceTools): readonly LocalAction[] {
  return [
    joinAction(services, tools),
    leaveAction(services, tools),
    speakAction(services, tools),
    ...transcriptActions(services, tools),
  ];
}
