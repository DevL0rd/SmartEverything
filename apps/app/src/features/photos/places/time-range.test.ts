import { describe, expect, it } from 'vitest';
import { PLACE_CLUSTER_QUERY } from '@smarteverything/domain';
import {
  fullRange,
  indexAt,
  monthsOf,
  rangeLabel,
  shareOf,
  windowOf,
  withEnd,
  withStart,
  yearTicks,
} from './time-range';

const MONTHS = monthsOf([
  { month: '2026-11', count: 40 },
  { month: '2019-01', count: 3 },
  { month: '2019-06', count: 12 },
  { month: '2024-05', count: 9 },
]);

describe('map time range', () => {
  it('orders months oldest first and starts with all of them', () => {
    expect(MONTHS.map((bucket) => bucket.month)).toEqual([
      '2019-01',
      '2019-06',
      '2024-05',
      '2026-11',
    ]);
    expect(fullRange(MONTHS)).toEqual({ start: 0, end: 3 });
    expect(windowOf(fullRange(MONTHS), MONTHS)).toEqual({});
  });

  it('asks for whole months when narrowed', () => {
    const window = windowOf({ start: 1, end: 2 }, MONTHS);
    expect(window).toEqual({ from: '2019-06-01T00:00:00.000Z', to: '2024-05-31T23:59:59.999Z' });
    expect(
      PLACE_CLUSTER_QUERY.safeParse({
        zoom: 0,
        west: -180,
        east: 180,
        north: 84,
        south: -58,
        ...window,
      }).success,
    ).toBe(true);
  });

  it('names the shown months', () => {
    expect(rangeLabel({ start: 0, end: 3 }, MONTHS)).toBe('Showing Jan 2019 to Nov 2026');
    expect(rangeLabel({ start: 2, end: 2 }, MONTHS)).toBe('Showing May 2024');
    expect(rangeLabel({ start: 0, end: 0 }, [])).toBeNull();
  });

  it('never lets the handles cross', () => {
    expect(withStart({ start: 0, end: 1 }, 3)).toEqual({ start: 1, end: 1 });
    expect(withEnd({ start: 2, end: 3 }, 0)).toEqual({ start: 2, end: 2 });
    expect(indexAt(0.6, 4)).toBe(2);
    expect(indexAt(2, 4)).toBe(3);
    expect(indexAt(-1, 4)).toBe(0);
  });

  it('ticks each year once and drops ticks that would overlap', () => {
    expect(yearTicks(MONTHS, 900, 48).map((tick) => tick.year)).toEqual(['2019', '2024', '2026']);
    expect(yearTicks(MONTHS, 70, 48).map((tick) => tick.year)).toEqual(['2019', '2026']);
  });

  it('puts handles and ticks on the centre of their month bar and reads a point back to its bar', () => {
    expect(shareOf(0, 4)).toBe(0.125);
    expect(shareOf(3, 4)).toBe(0.875);
    for (const index of [0, 1, 2, 3]) expect(indexAt(shareOf(index, 4), 4)).toBe(index);
    expect(indexAt(0.24, 4)).toBe(0);
    expect(indexAt(0.26, 4)).toBe(1);
    expect(yearTicks(MONTHS, 900, 48).map((tick) => tick.share)).toEqual([0.125, 0.625, 0.875]);
  });
});
