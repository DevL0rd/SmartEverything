import { describe, expect, it } from 'vitest';
import { stripChunks, stripColumnsAt, stripRows } from './strip-rows';

const COLUMNS = { compact: 2, medium: 3, expanded: 6 } as const;

describe('stripRows', () => {
  it('fills whole rows when the count divides evenly', () => {
    expect(stripRows(6, 2)).toEqual([2, 2, 2]);
    expect(stripRows(6, 3)).toEqual([3, 3]);
    expect(stripRows(6, 6)).toEqual([6]);
  });

  it('balances the rows so the last one is never a lone tile', () => {
    expect(stripRows(5, 2)).toEqual([3, 2]);
    expect(stripRows(7, 2)).toEqual([3, 2, 2]);
    expect(stripRows(5, 3)).toEqual([3, 2]);
    expect(stripRows(7, 3)).toEqual([3, 2, 2]);
    expect(stripRows(4, 3)).toEqual([2, 2]);
  });

  it('keeps a single tile on its own row and an empty strip empty', () => {
    expect(stripRows(1, 3)).toEqual([1]);
    expect(stripRows(0, 3)).toEqual([]);
  });

  it('never makes a row wider than one more tile than the column count', () => {
    for (let count = 2; count <= 40; count += 1) {
      for (let columns = 2; columns <= 6; columns += 1) {
        const rows = stripRows(count, columns);
        expect(rows.reduce((sum, size) => sum + size, 0)).toBe(count);
        expect(Math.min(...rows)).toBeGreaterThanOrEqual(2);
        expect(Math.max(...rows)).toBeLessThanOrEqual(columns + 1);
      }
    }
  });

  it('uses one column per tile when a single column is asked for', () => {
    expect(stripRows(3, 1)).toEqual([1, 1, 1]);
  });
});

describe('stripColumnsAt', () => {
  it('picks the column count of the width class the area falls in', () => {
    expect(stripColumnsAt(390, COLUMNS)).toBe(2);
    expect(stripColumnsAt(700, COLUMNS)).toBe(3);
    expect(stripColumnsAt(900, COLUMNS)).toBe(6);
    expect(stripColumnsAt(1600, COLUMNS)).toBe(6);
  });
});

describe('stripChunks', () => {
  it('splits the items in order into the balanced rows', () => {
    expect(stripChunks(['a', 'b', 'c', 'd', 'e'], 2)).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e'],
    ]);
  });

  it('returns no rows for no items', () => {
    expect(stripChunks([], 3)).toEqual([]);
  });
});
