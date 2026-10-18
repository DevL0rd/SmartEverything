import { describe, expect, it } from 'vitest';
import { rowsOfCards } from './card-grid';

describe('card grid', () => {
  it('packs cards into rows of the column count', () => {
    expect(rowsOfCards([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(rowsOfCards([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
    expect(rowsOfCards([], 2)).toEqual([]);
  });
});
