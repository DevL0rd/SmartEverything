import { VOICE_KEY_MISSING } from '@smarteverything/domain';
import type { IconName } from '../../../../components/icon';
import { duration } from '../../../../format/time';
import type { CallView } from '../call-state';

export const SHARING_STOPPED = 'Screen sharing stopped';

const TRANSCRIPT_SAVED = 'Transcript saved in the chat';
const MS_PER_SECOND = 1000;

type EndActionId = 'leave' | 'again' | 'settings' | 'microphone';

export interface EndAction {
  readonly id: EndActionId;
  readonly label: string;
  readonly icon?: IconName;
}

type EndKind = 'ended' | 'failed' | 'unreachable' | 'key' | 'microphone';

export interface EndState {
  readonly kind: EndKind;
  readonly title: string;
  readonly footnote: string;
  readonly primary: EndAction;
  readonly secondary: readonly EndAction[];
}

const CLOSE: EndAction = { id: 'leave', label: 'Close' };
const AGAIN: EndAction = { id: 'again', label: 'Call again', icon: 'phone' };

function microphoneEnd(name: string): EndState {
  return {
    kind: 'microphone',
    title: 'Microphone blocked',
    footnote: `Allow the microphone for SmartEverything to talk with ${name}.`,
    primary: { id: 'microphone', label: 'Allow microphone', icon: 'mic' },
    secondary: [CLOSE, AGAIN],
  };
}

function keyEnd(): EndState {
  return {
    kind: 'key',
    title: 'Call didn’t work',
    footnote: VOICE_KEY_MISSING,
    primary: { id: 'settings', label: 'Open settings', icon: 'settings' },
    secondary: [CLOSE, AGAIN],
  };
}

function failedEnd(call: CallView): EndState {
  return {
    kind: 'failed',
    title: 'Call didn’t work',
    footnote: call.problem ?? 'The call stopped unexpectedly. Try again.',
    primary: AGAIN,
    secondary: [CLOSE],
  };
}

function unreachableEnd(call: CallView): EndState {
  return {
    kind: 'unreachable',
    title: 'Connection lost',
    footnote: call.problem ?? 'Your home connection dropped.',
    primary: { id: 'again', label: 'Try again', icon: 'phone' },
    secondary: [CLOSE],
  };
}

function lengthOf(call: CallView): string | null {
  if (call.startedAt === null || call.endedAt === null) {
    return null;
  }
  return duration((call.endedAt - call.startedAt) / MS_PER_SECOND);
}

function endedFootnote(call: CallView, name: string): string {
  const saved = call.chatId !== null && call.ending !== 'replaced' ? TRANSCRIPT_SAVED : null;
  const parts = [lengthOf(call), call.sharedAtEnd ? SHARING_STOPPED : null, saved].filter(
    (part) => part !== null,
  );
  return parts.length === 0 ? name : parts.join(' · ');
}

function endedTitle(call: CallView): string {
  switch (call.ending) {
    case 'idle':
      return 'Ended after a quiet minute';
    case 'replaced':
      return 'Moved to another call';
    case 'hung_up':
    case 'finished':
    case 'failed':
    case 'disconnected':
    case null:
      return 'Call ended';
  }
}

function endedEnd(call: CallView, name: string): EndState {
  return {
    kind: 'ended',
    title: endedTitle(call),
    footnote: endedFootnote(call, name),
    primary: { id: 'leave', label: call.chatId === null ? 'Close' : 'Back to chat' },
    secondary: [AGAIN],
  };
}

export function endStateOf(call: CallView, name: string): EndState {
  if (call.fix === 'microphone') {
    return microphoneEnd(name);
  }
  if (call.problem === VOICE_KEY_MISSING) {
    return keyEnd();
  }
  switch (call.ending) {
    case 'failed':
      return failedEnd(call);
    case 'disconnected':
      return unreachableEnd(call);
    case 'hung_up':
    case 'finished':
    case 'idle':
    case 'replaced':
    case null:
      return endedEnd(call, name);
  }
}
