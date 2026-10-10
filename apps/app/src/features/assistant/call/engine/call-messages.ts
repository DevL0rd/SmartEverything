import type { AssistantVoiceServerMessage, CallEnding } from '@smarteverything/domain';
import { addToolLine, callState, changeCall } from '../call-state';

export interface MessageEffects {
  readonly ready: (available: boolean, reason: string | null) => void;
  readonly interrupted: () => void;
  readonly ended: (ending: CallEnding, detail: string | null) => void;
}

function caption(who: 'person' | 'assistant' | 'tool', text: string): void {
  if (who === 'tool') {
    addToolLine(text);
  } else {
    changeCall(() => (who === 'person' ? { heard: text } : { said: text }));
  }
}

export function applyServerMessage(
  message: AssistantVoiceServerMessage,
  effects: MessageEffects,
): void {
  if (message.type === 'ready') {
    effects.ready(message.available, message.reason);
    return;
  }
  if (message.callId !== callState.get().callId) {
    return;
  }
  if (message.type === 'call_state') {
    changeCall((call) => ({ phase: message.state, chatId: message.chatId ?? call.chatId }));
  } else if (message.type === 'caption') {
    caption(message.who, message.text);
  } else if (message.type === 'interrupted') {
    effects.interrupted();
  } else {
    effects.ended(message.reason, message.detail);
  }
}
