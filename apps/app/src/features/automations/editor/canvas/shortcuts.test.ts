import { describe, expect, it } from 'vitest';
import { SHORTCUTS } from '../../model/canvas/contract';
import {
  isDeleteKey,
  isOpenKey,
  panKeyFor,
  shortcutFor,
  viewportKeyFor,
  type KeyLike,
} from './shortcuts';

function key(name: string, held: Partial<KeyLike> = {}): KeyLike {
  return { key: name, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...held };
}

describe('canvas shortcuts', () => {
  it('maps command keys to contract shortcuts', () => {
    const names = ['z', 'y', 'c', 'v', 'x', 'd', 'g', 'a'].map((k) =>
      shortcutFor(key(k, { ctrlKey: true })),
    );
    for (const name of names) expect(SHORTCUTS).toContain(name);
    expect(shortcutFor(key('z', { metaKey: true, shiftKey: true }))).toBe('redo');
    expect(shortcutFor(key('Z', { ctrlKey: true }))).toBe('undo');
  });

  it('ignores plain letters for shortcuts', () => {
    expect(shortcutFor(key('c'))).toBeNull();
  });

  it('maps viewport keys', () => {
    expect(viewportKeyFor(key('+'))).toBe('zoomIn');
    expect(viewportKeyFor(key('-'))).toBe('zoomOut');
    expect(viewportKeyFor(key('0'))).toBe('reset');
    expect(viewportKeyFor(key('f'))).toBe('fit');
    expect(viewportKeyFor(key('F', { shiftKey: true }))).toBe('fitSelection');
    expect(viewportKeyFor(key('f', { ctrlKey: true }))).toBeNull();
  });

  it('maps arrows, delete and enter', () => {
    expect(panKeyFor(key('ArrowLeft'))).toBe('left');
    expect(panKeyFor(key('ArrowLeft', { altKey: true }))).toBeNull();
    expect(isDeleteKey(key('Delete'))).toBe(true);
    expect(isDeleteKey(key('Backspace', { ctrlKey: true }))).toBe(false);
    expect(isOpenKey(key('Enter'))).toBe(true);
  });
});
