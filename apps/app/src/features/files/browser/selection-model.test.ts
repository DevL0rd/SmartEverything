import { describe, expect, it } from 'vitest';
import { nodeOfEntry } from '../source/fixture-tree';
import {
  NO_SELECTION,
  focusedOf,
  keptIn,
  moveFocus,
  pickedOf,
  revealOffset,
  selectAllOf,
  selectOne,
  selectRange,
  selectionLabelOf,
  tapModeOf,
  tapped,
  toggleOne,
} from './selection-model';

const ORDER = ['a', 'b', 'c', 'd', 'e'];

describe('selection ranges', () => {
  it('selects from the anchor to the clicked row in either direction', () => {
    expect([...selectRange(selectOne('b'), ORDER, 'd').keys]).toEqual(['b', 'c', 'd']);
    expect([...selectRange(selectOne('d'), ORDER, 'a').keys]).toEqual(['a', 'b', 'c', 'd']);
    expect(selectRange(selectOne('d'), ORDER, 'a').anchor).toBe('d');
  });

  it('starts a new selection when there is no anchor', () => {
    expect([...selectRange(NO_SELECTION, ORDER, 'c').keys]).toEqual(['c']);
  });

  it('toggles single rows and moves the anchor to them', () => {
    const two = toggleOne(selectOne('a'), 'c');
    expect([...two.keys]).toEqual(['a', 'c']);
    expect(two.anchor).toBe('c');
    expect([...toggleOne(two, 'a').keys]).toEqual(['c']);
  });

  it('moves the focus with the arrows and extends with shift', () => {
    expect(moveFocus(NO_SELECTION, ORDER, 1, false).focus).toBe('a');
    expect(moveFocus(NO_SELECTION, ORDER, -1, false).focus).toBe('e');
    expect(moveFocus(selectOne('e'), ORDER, 1, false).focus).toBe('e');
    expect([...moveFocus(selectOne('b'), ORDER, 2, true).keys]).toEqual(['b', 'c', 'd']);
    expect(moveFocus(NO_SELECTION, [], 1, false)).toBe(NO_SELECTION);
  });

  it('selects everything shown', () => {
    const all = selectAllOf(ORDER);
    expect(all.keys.size).toBe(5);
    expect([all.anchor, all.focus]).toEqual(['a', 'e']);
  });
});

describe('taps', () => {
  it('ranges with shift, toggles in selection mode or with the toggle key, else picks one', () => {
    expect(tapModeOf({ shift: true, toggle: false, selecting: false })).toBe('range');
    expect(tapModeOf({ shift: false, toggle: true, selecting: false })).toBe('toggle');
    expect(tapModeOf({ shift: false, toggle: false, selecting: true })).toBe('toggle');
    expect(tapModeOf({ shift: false, toggle: false, selecting: false })).toBe('single');
    expect([...tapped(selectOne('a'), ORDER, 'c', 'range').keys]).toEqual(['a', 'b', 'c']);
    expect([...tapped(selectOne('a'), ORDER, 'c', 'toggle').keys]).toEqual(['a', 'c']);
    expect([...tapped(selectOne('a'), ORDER, 'c', 'single').keys]).toEqual(['c']);
  });
});

describe('selection against the listing', () => {
  const nodes = ['a', 'b', 'c'].map((key) => nodeOfEntry({ key, parentKey: 'p', name: key }));

  it('drops keys that left the listing and keeps the same object when nothing left', () => {
    const picked = selectAllOf(['a', 'b', 'c']);
    expect(keptIn(picked, ['a', 'b', 'c'])).toBe(picked);
    const kept = keptIn({ ...picked, focus: 'c' }, ['a', 'b']);
    expect([...kept.keys]).toEqual(['a', 'b']);
    expect(kept.focus).toBeNull();
  });

  it('reads the picked and focused nodes and names the count', () => {
    const selection = toggleOne(selectOne('a'), 'c');
    expect(pickedOf(nodes, selection).map((node) => node.key)).toEqual(['a', 'c']);
    expect(focusedOf(nodes, selection)?.key).toBe('c');
    expect(selectionLabelOf(1)).toBe('1 item selected');
    expect(selectionLabelOf(3)).toBe('3 items selected');
  });
});

describe('revealOffset', () => {
  const view = { offset: 560, viewport: 560 };

  it('leaves a row that is already in view where it is', () => {
    expect(revealOffset(12, 56, view)).toBeNull();
  });

  it('scrolls up to a row above the view and down to one below it', () => {
    expect(revealOffset(2, 56, view)).toBe(112);
    expect(revealOffset(25, 56, view)).toBe(26 * 56 - 560);
  });
});
