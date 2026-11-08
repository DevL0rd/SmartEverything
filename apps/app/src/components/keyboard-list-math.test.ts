import { describe, expect, it } from 'vitest';
import {
  acceptsListKey,
  acceptsSearchNavigationKey,
  edgeHighlight,
  keepHighlight,
  stepHighlight,
  type ListEntry,
} from './keyboard-list-math';

const rows: readonly ListEntry[] = [
  { id: 'a' },
  { id: 'b', disabled: true },
  { id: 'c' },
  { id: 'd', disabled: true },
];

describe('keyboard list highlight', () => {
  it('steps over disabled rows in both directions', () => {
    expect(stepHighlight(rows, 'a', 1, true)).toBe('c');
    expect(stepHighlight(rows, 'c', -1, true)).toBe('a');
  });

  it('wraps past either end when asked and stays put when not', () => {
    expect(stepHighlight(rows, 'c', 1, true)).toBe('a');
    expect(stepHighlight(rows, 'a', -1, true)).toBe('c');
    expect(stepHighlight(rows, 'c', 1, false)).toBe('c');
    expect(stepHighlight(rows, 'a', -1, false)).toBe('a');
  });

  it('starts from the matching end when nothing is highlighted', () => {
    expect(stepHighlight(rows, null, 1, true)).toBe('a');
    expect(stepHighlight(rows, null, -1, true)).toBe('c');
  });

  it('has nothing to highlight in an empty list or one with every row disabled', () => {
    expect(stepHighlight([], null, 1, true)).toBeNull();
    expect(edgeHighlight([{ id: 'x', disabled: true }], 'first')).toBeNull();
  });

  it('keeps the only row highlighted when wrapping', () => {
    expect(stepHighlight([{ id: 'only' }], 'only', 1, true)).toBe('only');
  });

  it('finds the first and last enabled rows', () => {
    expect(edgeHighlight(rows, 'first')).toBe('a');
    expect(edgeHighlight(rows, 'last')).toBe('c');
  });

  it('keeps a highlight only while its row still exists and is enabled', () => {
    expect(keepHighlight(rows, 'c')).toBe('c');
    expect(keepHighlight(rows, 'b')).toBeNull();
    expect(keepHighlight(rows, 'gone')).toBeNull();
    expect(keepHighlight(rows, null)).toBeNull();
  });

  it('moves through 300 rows without skipping any', () => {
    const many = Array.from({ length: 300 }, (_unused, index) => ({ id: `row-${String(index)}` }));
    let current: string | null = null;
    for (let step = 0; step < 300; step += 1) {
      current = stepHighlight(many, current, 1, false);
    }
    expect(current).toBe('row-299');
  });
});

const KEY = {
  keyCode: 0,
  defaultPrevented: false,
  isComposing: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
};

describe('search result navigation', () => {
  it.each(['ArrowDown', 'ArrowUp', 'Enter'])(
    'captures unmodified %s on the search input',
    (key) => {
      expect(acceptsSearchNavigationKey({ ...KEY, key })).toBe(true);
    },
  );

  it.each(['Tab', 'Home', 'End', 'ArrowLeft', 'ArrowRight', 'Escape', 'a'])(
    'leaves %s to the input or its normal handler',
    (key) => {
      expect(acceptsSearchNavigationKey({ ...KEY, key })).toBe(false);
    },
  );

  it.each(['altKey', 'ctrlKey', 'metaKey', 'shiftKey', 'isComposing', 'defaultPrevented'] as const)(
    'leaves ArrowDown and Enter alone when %s is set',
    (flag) => {
      expect(acceptsSearchNavigationKey({ ...KEY, key: 'ArrowDown', [flag]: true })).toBe(false);
      expect(acceptsSearchNavigationKey({ ...KEY, key: 'Enter', [flag]: true })).toBe(false);
    },
  );

  it('leaves the legacy IME Enter event alone', () => {
    expect(acceptsSearchNavigationKey({ ...KEY, key: 'Enter', keyCode: 229 })).toBe(false);
  });

  it('keeps the existing modifier behavior for ordinary list and combobox events', () => {
    const modified = { ...KEY, shiftKey: true };
    expect(acceptsListKey(modified, false)).toBe(true);
    expect(acceptsListKey(modified, true)).toBe(false);
  });
});
