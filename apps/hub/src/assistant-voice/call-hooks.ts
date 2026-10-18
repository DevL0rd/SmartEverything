import type { CallEnding } from '@smarteverything/domain';
import type { ToolHub } from '../ai-tools/tool-hub';
import type { ToolAnswer } from './tool-answer';
import { meter, toolCallerOf, type Call, type CallDeskOptions } from './call-parts';
import type { RecordedTurn } from './call-record';
import type { ConversationHooks } from './conversation-hooks';
import type { Outbox } from './outbox';
import type { HostedListening } from './outreach';
import type { SpeechSource } from './speech-input';
import { liveWindow } from './live-window';
import { historyOf } from './persona';
import { recentSpeechOf } from './recent-speech';
import {
  callSearchesWeb,
  declarationsOf,
  systemOf,
  voiceHub,
  voiceNoteOf,
  type VoiceKit,
  type VoiceWho,
} from './voice-kit';
import { voiceResponseOf } from './voice-results';
import { VOICE_TOOL_NAMES } from './voice-tools';

export interface CallHooksDeps {
  readonly options: CallDeskOptions;
  readonly outbox: Outbox;
  readonly ended: (call: Call, reason: CallEnding, detail: string | null) => void;
}

function kitOf(options: CallDeskOptions): VoiceKit {
  const { store, responder, tools, now } = options;
  return { store, responder, tools, now };
}

export function recordTurn(call: Call, turn: RecordedTurn): void {
  call.record.add(turn);
  if (turn.who === 'tool') {
    call.endpoint.send({ type: 'caption', callId: call.id, who: 'tool', text: turn.text });
  }
}

function sightAnswer(
  call: Call,
  name: string,
  args: Readonly<Record<string, unknown>>,
): Promise<ToolAnswer> | null {
  if (call.sight === null) {
    return null;
  }
  if (name === VOICE_TOOL_NAMES.see) {
    return call.sight.see(args);
  }
  return name === VOICE_TOOL_NAMES.stopLooking ? Promise.resolve(call.sight.stopLooking()) : null;
}

function taskOf(deps: CallHooksDeps, call: Call, task: string, said: string | null): string {
  const eventId = deps.options.responder.request({
    profileId: call.caller.profileId,
    clientId: call.caller.clientId,
    device: call.caller.device,
    task,
    said,
    callMessageId: call.record.messageId,
    chatId: call.chatId,
  });
  deps.outbox.track(eventId, call.caller.profileId);
  return eventId;
}

function staysOpenOf(call: Call): boolean {
  return call.source !== null;
}

function diagnosticsOf(
  options: CallDeskOptions,
  call: () => Call,
): Pick<ConversationHooks, 'measured' | 'stalled'> {
  return {
    measured: (event, fields): void => {
      options.log.info(event, { callId: call().id, ...fields });
    },
    stalled: (step): void => {
      options.log.warn('voice.no_reply', { callId: call().id, step });
    },
  };
}

function roomMediaHook(
  options: CallDeskOptions,
  call: () => Call,
): NonNullable<ConversationHooks['speaking']> {
  return (speaking) => {
    const { id, deviceId, caller } = call();
    options.roomMedia?.speaking({ id, deviceId, clientId: caller.clientId }, speaking);
  };
}

function whoOf(call: Call): VoiceWho {
  return {
    caller: call.caller,
    chatId: call.chatId,
    place: call.place,
    speaking: call.speaking,
    canSee: call.sight !== null,
    staysOpen: staysOpenOf(call),
  };
}

const HEARD = new WeakMap<Call, string | null>();

function heardBefore(options: CallDeskOptions, call: Call): string | null {
  if (!HEARD.has(call)) {
    HEARD.set(
      call,
      call.deviceId === null
        ? null
        : recentSpeechOf(options, {
            callId: call.id,
            deviceId: call.deviceId,
            role: call.caller.role,
            profileId: call.caller.profileId,
          }),
    );
  }
  return HEARD.get(call) ?? null;
}

type PromptHooks = Pick<
  ConversationHooks,
  'system' | 'note' | 'history' | 'window' | 'tools' | 'webSearch'
>;

function promptHooks(options: CallDeskOptions, call: () => Call, hub: () => ToolHub): PromptHooks {
  const { store } = options;
  const kit = kitOf(options);
  const who = (): VoiceWho => whoOf(call());
  return {
    system: () => systemOf(kit, hub(), who()),
    note: (known, starting) =>
      voiceNoteOf(kit, who(), { recentSpeech: heardBefore(options, call()), known, starting }),
    history: () => historyOf(store, call().chatId),
    window: () => liveWindow(store.assistantChat.settings()),
    tools: () => declarationsOf(kit, hub(), who()),
    webSearch: () => callSearchesWeb(hub()),
  };
}

export function conversationHooks(
  deps: CallHooksDeps,
  call: () => Call,
  speech: SpeechSource,
  listening: HostedListening | null,
): ConversationHooks {
  const { options } = deps;
  const { store } = options;
  const kit = kitOf(options);
  const who = (): VoiceWho => whoOf(call());
  let built: ToolHub | null = null;
  const hub = (): ToolHub => (built ??= voiceHub(kit, who));
  return {
    speech,
    ...(listening === null ? {} : { listening }),
    settings: () => store.assistantChat.settings().voice,
    ...promptHooks(options, call, hub),
    record: (turn): void => {
      recordTurn(call(), turn);
    },
    task: (task, said) => taskOf(deps, call(), task, said),
    run: async (name, args): Promise<ToolAnswer> => {
      const current = call();
      const sight = sightAnswer(current, name, args);
      if (sight !== null) {
        return sight;
      }
      const result = await hub().call(name, args, toolCallerOf(current));
      return { ...result, response: voiceResponseOf(name, args, result.response) };
    },
    ended: (reason, detail): void => {
      options.log.info('voice.conversation_ended', {
        callId: call().id,
        reason,
        detail: detail === null ? undefined : detail.slice(0, 200),
      });
      deps.ended(call(), reason, detail);
    },
    usage: (usage, model): void => {
      meter(options, call(), usage, model);
    },
    ...diagnosticsOf(options, call),
    speaking: roomMediaHook(options, call),
    detached: (): boolean => call().endpoint.detached,
    callId: (): string => call().id,
    staysOpenWhenQuiet: (): boolean => staysOpenOf(call()),
  };
}
