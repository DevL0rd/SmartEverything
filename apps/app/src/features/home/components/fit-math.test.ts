import { describe, expect, it } from 'vitest';
import { chunk, columnsIn, gridFit, linkedCapacity, peekCardWidth, rowsThatFit } from './fit-math';

describe('columnsIn', () => {
  it('counts only whole items plus their gaps', () => {
    expect(columnsIn(320, 140, 12, 4)).toBe(2);
    expect(columnsIn(291, 140, 12, 4)).toBe(1);
    expect(columnsIn(292, 140, 12, 4)).toBe(2);
  });
});

describe('chunk', () => {
  it('splits into rows and keeps a short last row', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe('rowsThatFit', () => {
  it('counts rows with gaps between them and always allows one', () => {
    expect(rowsThatFit(276, 132, 12)).toBe(2);
    expect(rowsThatFit(275, 132, 12)).toBe(1);
    expect(rowsThatFit(10, 132, 12)).toBe(1);
  });
});

describe('linkedCapacity', () => {
  it('leaves room for the link under the grid', () => {
    const space = { columns: 2, room: 272, minRow: 132, gap: 12, link: 48 };
    expect(linkedCapacity(space)).toBe(2);
    expect(linkedCapacity({ ...space, room: 340 })).toBe(4);
  });
});

describe('gridFit', () => {
  const space = { columns: 2, room: 272, minRow: 118, gap: 12, link: 48 };

  it('shows every room without a link when they fit', () => {
    expect(gridFit(4, space)).toEqual({ shown: 4, more: false });
  });

  it('trims to the rows that fit beside the link when they do not', () => {
    expect(gridFit(7, space)).toEqual({ shown: 2, more: true });
  });
});

describe('peekCardWidth', () => {
  it('fits whole cards of at least the minimum and shows part of the next one', () => {
    const card = peekCardWidth(505, 140, 16, 0.5);
    expect(card).toBe(189);
    expect(2 * card + 2 * 16 + card / 2).toBeLessThanOrEqual(505);
    expect(peekCardWidth(350, 140, 16, 0.5)).toBe(222);
  });
});
