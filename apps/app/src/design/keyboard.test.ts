import { describe, expect, it, vi } from 'vitest';
import { keyPressOf } from './keyboard';

type KeyEvent = Parameters<typeof keyPressOf>[0];

function event(init: Partial<KeyEvent>): KeyEvent {
  return {
    key: '',
    code: '',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    target: null,
    ...init,
  };
}

vi.stubGlobal('HTMLElement', function HTMLElement() {
  return undefined;
});

describe('keyPressOf', () => {
  it('reads the space bar as a space when the platform reports Unidentified for Ctrl+Space', () => {
    expect(keyPressOf(event({ key: 'Unidentified', code: 'Space', ctrlKey: true })).key).toBe(' ');
  });

  it('keeps the reported key otherwise', () => {
    expect(keyPressOf(event({ key: ' ', code: 'Space' })).key).toBe(' ');
    expect(keyPressOf(event({ key: 'Unidentified', code: 'KeyA' })).key).toBe('Unidentified');
    expect(keyPressOf(event({ key: 'k', code: 'KeyK' })).key).toBe('k');
  });
});
