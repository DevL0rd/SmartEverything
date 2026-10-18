import { describe, expect, it } from 'vitest';
import { chunk, columnsIn, gridFit, linkedCapacity, rowsThatFit, tileGrid } from './fit-math';

describe('tileGrid', () => {
  it('fits as many 156 px tiles as the touch width allows', () => {
    expect(tileGrid(326, 'touch', 12)).toEqual({ columns: 2, gap: 12, minRow: 132 });
    expect(tileGrid(308, 'touch', 12).columns).toBe(1);
    expect(tileGrid(660, 'touch', 12).columns).toBe(4);
  });

  it('uses the wider 168 px tile on pointer', () => {
    expect(tileGrid(508, 'pointer', 16)).toEqual({ columns: 2, gap: 16, minRow: 120 });
    expect(tileGrid(1072, 'pointer', 16).columns).toBe(4);
  });

  it('never goes below one column or above four', () => {
    expect(tileGrid(100, 'touch', 12).columns).toBe(1);
    expect(tileGrid(3000, 'pointer', 16).columns).toBe(4);
  });
});

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
