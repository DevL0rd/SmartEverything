import { isMacLike } from './platform';

export interface KeyPress {
  readonly key: string;
  readonly command: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
  readonly typing: boolean;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

type KeyEvent = Pick<
  KeyboardEvent,
  'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'target'
>;

function keyOf(event: KeyEvent): string {
  return event.key === 'Unidentified' && event.code === 'Space' ? ' ' : event.key;
}

export function keyPressOf(event: KeyEvent): KeyPress {
  return {
    key: keyOf(event),
    command: isMacLike() ? event.metaKey : event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    typing: isTyping(event.target),
  };
}
