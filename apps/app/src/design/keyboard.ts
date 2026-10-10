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

export function keyPressOf(event: KeyboardEvent): KeyPress {
  return {
    key: event.key,
    command: isMacLike() ? event.metaKey : event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    typing: isTyping(event.target),
  };
}
