import { describe, expect, it } from 'vitest';
import { emptySlotsOf, evenColumnsOf, rowsOfCards } from './card-grid';

describe('card grid', () => {
  it('packs cards into rows of the column count', () => {
    expect(rowsOfCards([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(rowsOfCards([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
    expect(rowsOfCards([], 2)).toEqual([]);
  });

  it('keeps a short last row at the width of a full row', () => {
    expect(emptySlotsOf(1, 3)).toEqual([1, 2]);
    expect(emptySlotsOf(2, 3)).toEqual([2]);
    expect(emptySlotsOf(3, 3)).toEqual([]);
  });

  it('spreads cards over rows as evenly as the column count allows', () => {
    expect(evenColumnsOf(2, 3)).toBe(3);
    expect(evenColumnsOf(3, 3)).toBe(3);
    expect(evenColumnsOf(4, 3)).toBe(2);
    expect(evenColumnsOf(5, 3)).toBe(3);
    expect(evenColumnsOf(7, 3)).toBe(3);
    expect(evenColumnsOf(8, 3)).toBe(3);
    expect(evenColumnsOf(4, 2)).toBe(2);
  });
});
