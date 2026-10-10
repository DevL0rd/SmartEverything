import {
  type AppSightSource,
  type AssistantVoiceServerMessage,
  type CallCapabilities,
  type CallEnding,
  type SightStopReason,
} from '@smarteverything/domain';
import { addLook, addToolLine, callState, changeCall } from '../call-state';

export interface MessageEffects {
  readonly ready: (available: boolean, reason: string | null) => void;
  readonly capabilities: (capabilities: CallCapabilities) => void;
  readonly capture: (requestId: string, source: AppSightSource, target: string | null) => void;
  readonly interrupted: () => void;
  readonly ended: (ending: CallEnding, detail: string | null) => void;
}

export const BUDGET_NOTICE = 'Video stopped: today’s AI budget is used up. The call continues.';

function caption(who: 'person' | 'assistant' | 'tool', text: string): void {
  if (who === 'tool') {
    addToolLine(text);
  } else {
    changeCall(() => (who === 'person' ? { heard: text } : { said: text }));
  }
}

function noticeOf(reason: SightStopReason | null, detail: string | null): string | null {
  if (reason === 'budget') {
    return BUDGET_NOTICE;
  }
  return reason === 'error' ? (detail ?? 'The picture stopped.') : null;
}

function sightMessage(message: AssistantVoiceServerMessage, effects: MessageEffects): boolean {
  if (message.type === 'sight_state') {
    changeCall((call) => ({
      sight:
        message.state === 'on'
          ? { source: message.source, label: message.label }
          : call.sight?.source === message.source
            ? null
            : call.sight,
      notice: message.state === 'off' ? noticeOf(message.reason, message.detail) : null,
    }));
  } else if (message.type === 'sight_request') {
    changeCall(() => ({
      request: {
        requestId: message.requestId,
        what: message.what,
        why: message.why,
        target: message.target,
      },
    }));
  } else if (message.type === 'sight_capture') {
    effects.capture(message.requestId, message.source, message.target);
  } else if (message.type === 'sight_looked') {
    addLook({
      lookId: message.lookId,
      source: message.source,
      label: message.label,
      at: message.at,
      trigger: message.trigger,
      picture: message.picture,
    });
  } else {
    return false;
  }
  return true;
}

export function applyServerMessage(
  message: AssistantVoiceServerMessage,
  effects: MessageEffects,
): void {
  if (message.type === 'ready') {
    effects.ready(message.available, message.reason);
    return;
  }
  if (message.type === 'capabilities') {
    changeCall(() => ({ capabilities: message }));
    effects.capabilities(message);
    return;
  }
  if (message.callId !== callState.get().callId || sightMessage(message, effects)) {
    return;
  }
  if (message.type === 'call_state') {
    changeCall((call) => ({ phase: message.state, chatId: message.chatId ?? call.chatId }));
  } else if (message.type === 'caption') {
    caption(message.who, message.text);
  } else if (message.type === 'interrupted') {
    effects.interrupted();
  } else if (message.type === 'ended') {
    effects.ended(message.reason, message.detail);
  }
}
