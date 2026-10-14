import type { CallEnding } from '@smarteverything/domain';
import type { ToolAnswer } from './tool-answer';
import { meter, toolCallerOf, type Call, type CallDeskOptions } from './call-parts';
import type { RecordedTurn } from './call-record';
import type { ConversationHooks } from './conversation-hooks';
import type { Outbox } from './outbox';
import type { HostedListening } from './outreach';
import type { SpeechSource } from './speech-input';
import { liveWindow } from './live-window';
import { declarationsOf, systemOf, voiceHub, type VoiceKit, type VoiceWho } from './voice-kit';
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

export function conversationHooks(
  deps: CallHooksDeps,
  call: () => Call,
  speech: SpeechSource,
  listening: HostedListening | null,
): ConversationHooks {
  const { options } = deps;
  const { store } = options;
  const kit = kitOf(options);
  const who = (): VoiceWho => ({
    caller: call().caller,
    chatId: call().chatId,
    place: call().place,
    speaking: call().speaking,
    canSee: call().sight !== null,
    staysOpen: staysOpenOf(call()),
  });
  return {
    speech,
    ...(listening === null ? {} : { listening }),
    settings: () => store.assistantChat.settings().voice,
    system: () => systemOf(kit, who()),
    window: () => liveWindow(store.assistantChat.settings()),
    tools: () => declarationsOf(kit, who()),
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
      const result = await voiceHub(kit, who()).call(name, args, toolCallerOf(current));
      return { response: result.response, line: result.line, pictures: result.pictures };
    },
    ended: (reason, detail): void => {
      deps.ended(call(), reason, detail);
    },
    usage: (usage, model): void => {
      meter(options, call(), usage, model);
    },
    ...diagnosticsOf(options, call),
    detached: (): boolean => call().endpoint.detached,
    staysOpenWhenQuiet: (): boolean => staysOpenOf(call()),
  };
}
