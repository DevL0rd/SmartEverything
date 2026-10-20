import { describe, expect, it } from 'vitest';
import { automation, step, trigger } from './editor-fixtures';
import {
  EMPTY_SELECTION,
  clearSelection,
  extendTo,
  isSelected,
  programOrder,
  pruneSelection,
  selectAll,
  selectOnly,
  toggle,
} from './selection';

const ORDER = ['a', 'b', 'c', 'd', 'e'];

describe('selection', () => {
  it('lists triggers before body steps in program order', () => {
    const first = trigger('t1');
    const a = step('a');
    const b = step('b');
    expect(programOrder(automation([a, b], [first]))).toEqual([first.id, a.id, b.id]);
  });

  it('selects one item and keeps the same object when nothing changes', () => {
    const one = selectOnly(EMPTY_SELECTION, 'a');
    expect(one).toEqual({ ids: ['a'], anchor: 'a' });
    expect(selectOnly(one, 'a')).toBe(one);
    expect(selectOnly(one, 'b')).toEqual({ ids: ['b'], anchor: 'b' });
    expect(selectOnly({ ids: ['a', 'b'], anchor: 'a' }, 'a')).toEqual({ ids: ['a'], anchor: 'a' });
    expect(selectOnly({ ids: ['a'], anchor: 'b' }, 'a')).toEqual({ ids: ['a'], anchor: 'a' });
    expect(selectOnly({ ids: ['b'], anchor: 'b' }, 'a')).toEqual({ ids: ['a'], anchor: 'a' });
  });

  it('toggles items in and out and moves the anchor', () => {
    const two = toggle(toggle(EMPTY_SELECTION, 'a'), 'b');
    expect(two).toEqual({ ids: ['a', 'b'], anchor: 'b' });
    expect(isSelected(two, 'a')).toBe(true);
    const one = toggle(two, 'b');
    expect(one).toEqual({ ids: ['a'], anchor: 'a' });
    expect(toggle(one, 'a')).toEqual(EMPTY_SELECTION);
  });

  it('extends a range from the anchor in either direction', () => {
    const start = selectOnly(EMPTY_SELECTION, 'b');
    expect(extendTo(start, ORDER, 'd')).toEqual({ ids: ['b', 'c', 'd'], anchor: 'b' });
    expect(extendTo(start, ORDER, 'a')).toEqual({ ids: ['a', 'b'], anchor: 'b' });
    const widened = extendTo(extendTo(start, ORDER, 'c'), ORDER, 'e');
    expect(widened.ids).toEqual(['b', 'c', 'd', 'e']);
  });

  it('falls back to a single selection without a usable anchor', () => {
    expect(extendTo(EMPTY_SELECTION, ORDER, 'c')).toEqual({ ids: ['c'], anchor: 'c' });
    expect(extendTo(selectOnly(EMPTY_SELECTION, 'zz'), ORDER, 'c')).toEqual({
      ids: ['c'],
      anchor: 'c',
    });
    expect(extendTo(selectOnly(EMPTY_SELECTION, 'a'), ORDER, 'zz')).toEqual({
      ids: ['zz'],
      anchor: 'zz',
    });
  });

  it('selects all, and keeps the same object when all are already selected', () => {
    const all = selectAll(EMPTY_SELECTION, ORDER);
    expect(all).toEqual({ ids: ORDER, anchor: 'e' });
    expect(selectAll(all, ORDER)).toBe(all);
    expect(selectAll({ ids: ['a'], anchor: 'a' }, ORDER).ids).toEqual(ORDER);
    expect(selectAll({ ids: ['a', 'b', 'x', 'd', 'e'], anchor: 'a' }, ORDER).ids).toEqual(ORDER);
    expect(selectAll(EMPTY_SELECTION, [])).toBe(EMPTY_SELECTION);
    expect(selectAll({ ids: ['a'], anchor: 'a' }, [])).toBe(EMPTY_SELECTION);
  });

  it('clears', () => {
    expect(clearSelection(EMPTY_SELECTION)).toBe(EMPTY_SELECTION);
    expect(clearSelection({ ids: ['a'], anchor: 'a' })).toBe(EMPTY_SELECTION);
    expect(clearSelection({ ids: [], anchor: 'a' })).toBe(EMPTY_SELECTION);
  });

  it('drops items that no longer exist and fixes the anchor', () => {
    const selection = { ids: ['a', 'b', 'c'], anchor: 'c' };
    expect(pruneSelection(selection, new Set(['a', 'b', 'c']))).toBe(selection);
    expect(pruneSelection(selection, new Set(['a', 'c']))).toEqual({
      ids: ['a', 'c'],
      anchor: 'c',
    });
    expect(pruneSelection(selection, new Set(['a', 'b']))).toEqual({
      ids: ['a', 'b'],
      anchor: 'b',
    });
    expect(pruneSelection(selection, new Set())).toEqual(EMPTY_SELECTION);
    expect(pruneSelection({ ids: ['a', 'b'], anchor: null }, new Set(['a']))).toEqual({
      ids: ['a'],
      anchor: 'a',
    });
  });
});
