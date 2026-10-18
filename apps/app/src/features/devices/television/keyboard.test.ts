import { describe, expect, it } from 'vitest';
import { digitKeyOf, keyboardAction, routeKeyboard } from './keyboard';

const plain = { metaKey: false, ctrlKey: false, altKey: false };

describe('television keyboard', () => {
  it('maps the arrow keys, enter and escape to the remote keys', () => {
    expect(keyboardAction({ ...plain, key: 'ArrowLeft' })).toEqual({ kind: 'key', key: 'left' });
    expect(keyboardAction({ ...plain, key: 'Enter' })).toEqual({ kind: 'key', key: 'ok' });
    expect(keyboardAction({ ...plain, key: 'Escape' })).toEqual({ kind: 'key', key: 'back' });
    expect(keyboardAction({ ...plain, key: ' ' })).toEqual({ kind: 'key', key: 'play_pause' });
  });

  it('maps plus, minus, h and m to volume, home and mute', () => {
    expect(keyboardAction({ ...plain, key: '+' })).toEqual({ kind: 'key', key: 'vol_up' });
    expect(keyboardAction({ ...plain, key: '-' })).toEqual({ kind: 'key', key: 'vol_down' });
    expect(keyboardAction({ ...plain, key: 'h' })).toEqual({ kind: 'key', key: 'home' });
    expect(keyboardAction({ ...plain, key: 'm' })).toEqual({ kind: 'key', key: 'mute' });
  });

  it('reads number keys as digits', () => {
    expect(keyboardAction({ ...plain, key: '7' })).toEqual({ kind: 'digit', digit: '7' });
    expect(digitKeyOf('7')).toBe('n7');
    expect(digitKeyOf('x')).toBeNull();
  });

  it('leaves shortcuts with a modifier and unknown keys to the browser', () => {
    expect(keyboardAction({ ...plain, ctrlKey: true, key: 'm' })).toBeNull();
    expect(keyboardAction({ ...plain, metaKey: true, key: 'ArrowLeft' })).toBeNull();
    expect(keyboardAction({ ...plain, key: 'q' })).toBeNull();
  });

  it('reads backspace as erase and escape as back', () => {
    expect(keyboardAction({ ...plain, key: 'Backspace' })).toEqual({ kind: 'erase' });
    expect(keyboardAction({ ...plain, key: 'Escape' })).toEqual({ kind: 'key', key: 'back' });
  });

  it('sends keys to the TV only while no sheet is open', () => {
    const back = { kind: 'key', key: 'back' } as const;
    expect(routeKeyboard(back, true, null)).toEqual({ kind: 'press', key: 'back' });
    expect(routeKeyboard(back, true, 'inputs')).toBeNull();
    expect(routeKeyboard(back, true, 'volume')).toBeNull();
    expect(routeKeyboard({ kind: 'erase' }, true, 'sleep')).toBeNull();
  });

  it('keeps backspace for erasing in the number pad instead of sending Back', () => {
    expect(routeKeyboard({ kind: 'erase' }, true, 'numpad')).toEqual({ kind: 'erase' });
    expect(routeKeyboard({ kind: 'erase' }, true, null)).toEqual({ kind: 'press', key: 'back' });
  });

  it('adds typed digits to the open number pad instead of restarting it', () => {
    expect(routeKeyboard({ kind: 'digit', digit: '4' }, true, 'numpad')).toEqual({
      kind: 'digit',
      digit: '4',
    });
    expect(routeKeyboard({ kind: 'key', key: 'back' }, true, 'numpad')).toBeNull();
  });

  it('opens the number pad on a digit only when the TV can take one', () => {
    const seven = { kind: 'digit', digit: '7' } as const;
    expect(routeKeyboard(seven, true, null)).toEqual({ kind: 'open_numpad', digit: '7' });
    expect(routeKeyboard(seven, false, null)).toBeNull();
  });
});
