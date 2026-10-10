import { ASSISTANT_VOICE_SERVER_MESSAGE, type CallEnding } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import { Linking } from 'react-native';
import { randomUUID } from 'expo-crypto';
import {
  addAssistantCallListeners,
  answerAssistantCall,
  assistantCallLevel,
  assistantCallLinked,
  beginAssistantCall,
  endAssistantCall,
  muteAssistantCall,
  openAssistantCall,
} from '../../../../../modules/health-connect';
import { jsonText } from '../../../../format/json-text';
import { rawErrorText } from '../../../../format/errors';
import {
  IDLE_CALL,
  callActive,
  callState,
  changeCall,
  markEnded,
  type CallFix,
} from '../call-state';
import type { CallEngine, CallRequest } from './call-engine';
import { applyServerMessage } from './call-messages';

const log = new Logger('app.assistant-call');

let listeners: { readonly remove: () => void } | null = null;
let request: CallRequest | null = null;

interface Finish {
  readonly ending: CallEnding;
  readonly problem: string | null;
  readonly callId?: string | null;
  readonly fix?: CallFix;
}

function finish({ ending, problem, callId = null, fix }: Finish): void {
  listeners?.remove();
  listeners = null;
  request = null;
  endAssistantCall(callId).catch((error: unknown) => {
    log.warn('call.native_end_failed', { reason: rawErrorText(error) });
  });
  markEnded({ ending, problem, ...(fix === undefined ? {} : { fix }) });
}

function failed(problem: string): (error: unknown) => void {
  return (error) => {
    log.warn('call.native_failed', { problem, reason: rawErrorText(error) });
    finish({ ending: 'failed', problem });
  };
}

async function begin(): Promise<void> {
  const { callId } = callState.get();
  if (callId === null || request === null) {
    return;
  }
  const microphone = await requestRecordingPermissionsAsync();
  if (!microphone.granted) {
    finish({ ending: 'failed', problem: 'Microphone not available', fix: 'microphone' });
    return;
  }
  const { source, device, chatId, answering } = request;
  await (answering === null
    ? beginAssistantCall(callId, source, device, chatId)
    : answerAssistantCall({ callId, source, device, chatId, answering }));
}

function receive(json: string): void {
  const read = jsonText(json);
  const parsed = read.ok ? ASSISTANT_VOICE_SERVER_MESSAGE.safeParse(read.value) : null;
  if (parsed?.success !== true) {
    log.warn('call.unreadable', { text: json.slice(0, 120) });
    return;
  }
  applyServerMessage(parsed.data, {
    ready: (available, reason) => {
      if (available) {
        begin().catch(failed('Microphone not available'));
      } else {
        finish({ ending: 'failed', problem: reason });
      }
    },
    interrupted: () => undefined,
    ended: (ending, detail) => {
      finish({ ending, problem: detail });
    },
  });
}

export const callEngine: CallEngine = {
  supported: () =>
    assistantCallLinked() ? null : 'Install the newest SmartEverything app to call the assistant.',
  start: (next) => {
    if (callActive(callState.get())) {
      return;
    }
    request = next;
    changeCall(() => ({
      ...IDLE_CALL,
      phase: 'connecting',
      callId: randomUUID(),
      startedAt: Date.now(),
      chatId: next.chatId,
    }));
    listeners = addAssistantCallListeners({
      message: receive,
      closed: (code, reason) => {
        if (callActive(callState.get())) {
          log.warn('call.socket_closed', { code, reason });
          finish({
            ending: 'disconnected',
            problem: reason === '' ? 'The connection to your home dropped.' : reason,
          });
        }
      },
    });
    openAssistantCall(next.connection.url, next.connection.token).catch(
      failed('The assistant could not start'),
    );
  },
  end: () => {
    finish({ ending: 'hung_up', problem: null, callId: callState.get().callId });
  },
  mute: (muted) => {
    const { callId } = callState.get();
    changeCall(() => ({ muted }));
    if (callId !== null) {
      muteAssistantCall(callId, muted).catch(failed('Mute did not work'));
    }
  },
  allowMicrophone: async () => {
    const microphone = await requestRecordingPermissionsAsync();
    if (!microphone.granted && !microphone.canAskAgain) {
      await Linking.openSettings();
    }
    return microphone.granted;
  },
  inputLevel: () => (callActive(callState.get()) ? assistantCallLevel() : 0),
  outputLevel: () => 0,
};
