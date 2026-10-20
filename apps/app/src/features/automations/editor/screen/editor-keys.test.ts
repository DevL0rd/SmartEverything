import { describe, expect, it } from 'vitest';
import type { KeyLike } from '../canvas/shortcuts';
import { SHORTCUT_GROUPS, editorKeyFor } from './editor-keys';

const press = (
  key: string,
  extra: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean } = {},
): KeyLike => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...extra });

describe('editor keys', () => {
  it('maps Ctrl or Cmd chords to publish, test, add, undo and redo', () => {
    expect(editorKeyFor(press('s', { ctrlKey: true }), false)).toBe('publish');
    expect(editorKeyFor(press('s', { metaKey: true }), false)).toBe('publish');
    expect(editorKeyFor(press('Enter', { ctrlKey: true }), false)).toBe('test');
    expect(editorKeyFor(press('k', { ctrlKey: true }), false)).toBe('palette');
    expect(editorKeyFor(press('z', { ctrlKey: true }), false)).toBe('undo');
    expect(editorKeyFor(press('z', { ctrlKey: true, shiftKey: true }), false)).toBe('redo');
    expect(editorKeyFor(press('y', { ctrlKey: true }), false)).toBe('redo');
  });

  it('maps ? to help and / to add', () => {
    expect(editorKeyFor(press('?', { shiftKey: true }), false)).toBe('help');
    expect(editorKeyFor(press('/'), false)).toBe('palette');
  });

  it('leaves typing alone: no undo, help or add while a text field has focus, but publish and test still work', () => {
    expect(editorKeyFor(press('z', { ctrlKey: true }), true)).toBeNull();
    expect(editorKeyFor(press('?'), true)).toBeNull();
    expect(editorKeyFor(press('/'), true)).toBeNull();
    expect(editorKeyFor(press('s', { ctrlKey: true }), true)).toBe('publish');
    expect(editorKeyFor(press('Enter', { ctrlKey: true }), true)).toBe('test');
  });

  it('ignores keys the canvas or the browser owns', () => {
    expect(editorKeyFor(press('c', { ctrlKey: true }), false)).toBeNull();
    expect(editorKeyFor(press('a'), false)).toBeNull();
    expect(editorKeyFor(press('/', { altKey: true }), false)).toBeNull();
  });

  it('documents every key chord it handles in the shortcut sheet', () => {
    const keys = SHORTCUT_GROUPS.flatMap((group) => group.rows.map((row) => row.keys)).join('|');
    for (const needed of ['Ctrl+S', 'Ctrl+Enter', 'Ctrl+K', 'Ctrl+Z', '?', '/']) {
      expect(keys).toContain(needed);
    }
  });
});
