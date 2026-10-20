import { describe, expect, it } from 'vitest';
import type { KeyPress } from '../design/keyboard';
import {
  SHORTCUTS,
  SHORTCUT_SCOPES,
  chordMatches,
  chordParts,
  filteredShortcuts,
  reservedKeys,
  shortcutOf,
  shortcutPressed,
  type Chord,
} from './shortcuts';

const press = (change: Partial<KeyPress>): KeyPress => ({
  key: 'k',
  command: false,
  alt: false,
  shift: false,
  typing: false,
  ...change,
});

function keysOf(chord: Chord): readonly string[] {
  return [chord.key, ...(chord.alsoKeys ?? [])].map((key) => key.toLowerCase());
}

function collide(left: Chord, right: Chord): boolean {
  return (
    keysOf(left).some((key) => keysOf(right).includes(key)) &&
    (left.command === true) === (right.command === true) &&
    (left.alt === true) === (right.alt === true) &&
    (left.shift === undefined || right.shift === undefined || left.shift === right.shift)
  );
}

describe('the shortcut table', () => {
  it('gives every shortcut its own id', () => {
    expect(new Set(SHORTCUTS.map((shortcut) => shortcut.id)).size).toBe(SHORTCUTS.length);
  });

  it('never gives two shortcuts of one scope the same keys', () => {
    for (const scope of SHORTCUT_SCOPES) {
      const chords = SHORTCUTS.filter((shortcut) => shortcut.scope === scope).flatMap((shortcut) =>
        shortcut.chords.map((chord) => ({ id: shortcut.id, chord })),
      );
      chords.forEach((left, index) => {
        for (const right of chords.slice(index + 1)) {
          expect(collide(left.chord, right.chord), `${left.id} and ${right.id} in ${scope}`).toBe(
            false,
          );
        }
      });
    }
  });

  it('uses only known scopes and names a button for every browser-reserved key', () => {
    for (const shortcut of SHORTCUTS) {
      expect(SHORTCUT_SCOPES).toContain(shortcut.scope);
      if (shortcut.reserved === true) {
        expect(shortcut.alternative, shortcut.id).toBeDefined();
      }
    }
  });

  it('writes the keys of each layout', () => {
    const chord = { key: 'o', command: true, shift: true } as const;
    expect(chordParts(chord, true)).toEqual(['⌘', '⇧', 'O']);
    expect(chordParts(chord, false)).toEqual(['Ctrl', 'Shift', 'O']);
    expect(chordParts({ key: 'ArrowUp', label: '↑', alt: true }, true)).toEqual(['Alt', '↑']);
  });
});

describe('matching a key press', () => {
  it('tells the thinking shortcut from the edit-layout key and the model panel', () => {
    expect(shortcutOf(press({ key: 'E', command: true, shift: true }))?.id).toBe('thinking');
    expect(shortcutOf(press({ key: 'e' }))?.id).toBe('edit-layout');
    expect(shortcutOf(press({ key: '.', command: true }))?.id).toBe('model-panel');
  });

  it('keeps the access panel and the model library on their own keys', () => {
    expect(shortcutOf(press({ key: 'L', command: true, shift: true }))?.id).toBe('access');
    expect(shortcutOf(press({ key: 'l', command: true }))?.id).toBe('library');
  });

  it('matches the question mark whether or not shift is held', () => {
    expect(shortcutPressed(press({ key: '?', shift: true }), 'help')).toBe(true);
    expect(shortcutPressed(press({ key: '?' }), 'help')).toBe(true);
  });

  it('does not match when another modifier is held', () => {
    expect(
      chordMatches(press({ key: 'k', command: true, alt: true }), { key: 'k', command: true }),
    ).toBe(false);
    expect(shortcutPressed(press({ key: 'k' }), 'search')).toBe(false);
    expect(shortcutPressed(press({ key: '/' }), 'search')).toBe(true);
  });
});

describe('the spaces and the browser-reserved keys', () => {
  it('matches every space number with the command key', () => {
    for (const digit of ['1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      expect(shortcutOf(press({ key: digit, command: true }))?.id, digit).toBe('space');
    }
    expect(shortcutOf(press({ key: '0', command: true }))).toBeUndefined();
  });

  it('names the reserved keys of each layout', () => {
    expect(reservedKeys(true)).toBe('⌘⇧L, ⌘⇧D and ⌘L');
    expect(reservedKeys(false)).toBe('Ctrl+Shift+L, Ctrl+Shift+D and Ctrl+L');
  });
});

describe('searching the shortcuts', () => {
  it('finds by action or scope and narrows to one scope', () => {
    expect(filteredShortcuts('model', 'All').map((row) => row.id)).toEqual(
      expect.arrayContaining(['model-panel', 'library']),
    );
    expect(filteredShortcuts('', 'Model panel').map((row) => row.id)).toEqual(['library']);
    expect(filteredShortcuts('zzzz', 'All')).toEqual([]);
  });
});
