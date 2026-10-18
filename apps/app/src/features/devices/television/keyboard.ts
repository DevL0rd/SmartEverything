import type { TvKey } from '@smarteverything/domain';
import { DIGIT_KEYS } from './keys';
import type { SheetKind } from './sheet-state';

export type KeyboardAction =
  | { readonly kind: 'key'; readonly key: TvKey }
  | { readonly kind: 'digit'; readonly digit: string }
  | { readonly kind: 'erase' };

export interface KeyEvent {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
}

const KEYBOARD_KEYS: Readonly<Record<string, TvKey>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Escape: 'back',
  h: 'home',
  m: 'mute',
  '+': 'vol_up',
  '=': 'vol_up',
  '-': 'vol_down',
  ' ': 'play_pause',
  Enter: 'ok',
};

export function keyboardAction(event: KeyEvent): KeyboardAction | null {
  if (event.metaKey || event.ctrlKey || event.altKey) {
    return null;
  }
  if (event.key.length === 1 && event.key >= '0' && event.key <= '9') {
    return { kind: 'digit', digit: event.key };
  }
  if (event.key === 'Backspace') {
    return { kind: 'erase' };
  }
  const key = KEYBOARD_KEYS[event.key];
  return key === undefined ? null : { kind: 'key', key };
}

export function digitKeyOf(digit: string): TvKey | null {
  const index = Number(digit);
  return Number.isInteger(index) ? (DIGIT_KEYS[index] ?? null) : null;
}

export type KeyboardRoute =
  | { readonly kind: 'press'; readonly key: TvKey }
  | { readonly kind: 'open_numpad'; readonly digit: string }
  | { readonly kind: 'digit'; readonly digit: string }
  | { readonly kind: 'erase' };

export function routeKeyboard(
  action: KeyboardAction,
  numberPad: boolean,
  sheet: SheetKind | null,
): KeyboardRoute | null {
  if (sheet === 'numpad') {
    return action.kind === 'digit' || action.kind === 'erase' ? action : null;
  }
  if (sheet !== null) {
    return null;
  }
  switch (action.kind) {
    case 'key':
      return { kind: 'press', key: action.key };
    case 'erase':
      return { kind: 'press', key: 'back' };
    case 'digit':
      return numberPad && digitKeyOf(action.digit) !== null
        ? { kind: 'open_numpad', digit: action.digit }
        : null;
  }
}
