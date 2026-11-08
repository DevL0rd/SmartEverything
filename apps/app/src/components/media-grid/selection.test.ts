import { describe, expect, it } from 'vitest';
import {
  beginSelecting,
  dayActionText,
  dayMark,
  dragTo,
  NO_SELECTION,
  rangeOf,
  selectAll,
  selectedText,
  selectRange,
  startDrag,
  toggleDay,
  toggleItem,
  type MediaSelection,
} from './selection';

const ORDER = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

function ids(selection: MediaSelection): readonly string[] {
  return [...selection.ids].sort();
}

describe('media selection', () => {
  it('enters select mode empty from the header Select', () => {
    const selection = beginSelecting(NO_SELECTION);
    expect(selection.active).toBe(true);
    expect(ids(selection)).toEqual([]);
    expect(beginSelecting(selection)).toBe(selection);
  });

  it('toggles a tile check and moves the range anchor to it', () => {
    const one = toggleItem(NO_SELECTION, 'b');
    expect(ids(one)).toEqual(['b']);
    expect(one.anchor).toBe('b');
    expect(ids(toggleItem(one, 'b'))).toEqual([]);
  });

  it('shift-click adds every item between the anchor and the click, in either direction', () => {
    const anchored = toggleItem(NO_SELECTION, 'b');
    expect(ids(selectRange(anchored, ORDER, 'e'))).toEqual(['b', 'c', 'd', 'e']);
    const back = toggleItem(NO_SELECTION, 'e');
    expect(ids(selectRange(back, ORDER, 'c'))).toEqual(['c', 'd', 'e']);
    expect(ids(selectRange(NO_SELECTION, ORDER, 'c'))).toEqual(['c']);
  });

  it('shift-click from an anchor that has left the loaded pages picks only the click', () => {
    expect(rangeOf(ORDER, 'gone', 'c')).toEqual(['c']);
    expect(rangeOf(ORDER, 'a', 'gone')).toEqual([]);
  });

  it('day Select picks the whole day, and a full day deselects', () => {
    const day = ['c', 'd', 'e'];
    const some = toggleItem(NO_SELECTION, 'd');
    expect(dayMark(some, day)).toBe('some');
    expect(dayActionText(dayMark(some, day))).toBe('Select');
    const full = toggleDay(some, day);
    expect(ids(full)).toEqual(['c', 'd', 'e']);
    expect(dayMark(full, day)).toBe('all');
    expect(dayActionText('all')).toBe('Deselect');
    expect(ids(toggleDay(full, day))).toEqual([]);
    expect(dayMark(NO_SELECTION, day)).toBe('none');
  });

  it('drag to extend adds the swept range from an unchecked tile and keeps what was picked before', () => {
    const before = toggleItem(NO_SELECTION, 'a');
    const drag = startDrag(before, 'c');
    expect(drag.adding).toBe(true);
    expect(ids(dragTo(drag, ORDER, 'e'))).toEqual(['a', 'c', 'd', 'e']);
    expect(ids(dragTo(drag, ORDER, 'd'))).toEqual(['a', 'c', 'd']);
    expect(ids(dragTo(drag, ORDER, 'b'))).toEqual(['a', 'b', 'c']);
  });

  it('drag from a checked tile clears the swept range', () => {
    const picked = selectAll(ORDER);
    const drag = startDrag(picked, 'b');
    expect(drag.adding).toBe(false);
    expect(ids(dragTo(drag, ORDER, 'd'))).toEqual(['a', 'e', 'f']);
  });

  it('counts the selection for the selection bar', () => {
    expect(selectedText(selectAll(ORDER))).toBe('6 selected');
  });
});
