import { describe, expect, it } from 'vitest';
import type { KeyPress } from '../../../design/keyboard';
import { viewerKeyAction } from './keys';

function press(key: string, patch: Partial<KeyPress> = {}): KeyPress {
  return { key, command: false, alt: false, shift: false, typing: false, ...patch };
}

describe('viewer keys', () => {
  it('browses with the arrows and toggles favourite and info', () => {
    expect(viewerKeyAction(press('ArrowLeft'))).toBe('previous');
    expect(viewerKeyAction(press('ArrowRight'))).toBe('next');
    expect(viewerKeyAction(press('f'))).toBe('favourite');
    expect(viewerKeyAction(press('F', { shift: true }))).toBe('favourite');
    expect(viewerKeyAction(press('i'))).toBe('info');
  });

  it('leaves typing and app shortcuts alone', () => {
    expect(viewerKeyAction(press('f', { typing: true }))).toBeNull();
    expect(viewerKeyAction(press('f', { command: true }))).toBeNull();
    expect(viewerKeyAction(press('i', { alt: true }))).toBeNull();
    expect(viewerKeyAction(press('x'))).toBeNull();
  });
});
