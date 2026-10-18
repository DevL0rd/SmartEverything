import { describe, expect, it } from 'vitest';
import {
  megabitPoints,
  megabitsOf,
  peakOf,
  tableRows,
  tableStep,
  withLatest,
} from './traffic-model';

describe('traffic series', () => {
  it('converts bytes per second to megabits per second', () => {
    expect(megabitsOf(125_000)).toBe(1);
    expect(megabitsOf(22_750_000)).toBeCloseTo(182, 6);
    expect(megabitPoints([{ t: 1, v: 250_000 }])).toEqual([{ t: 1, v: 2 }]);
  });

  it('ends the series on the live reading, replacing samples at or after it', () => {
    const points = [
      { t: 10, v: 1 },
      { t: 20, v: 2 },
      { t: 30, v: 3 },
    ];
    expect(withLatest(points, { at: 25, value: 9 })).toEqual([
      { t: 10, v: 1 },
      { t: 20, v: 2 },
      { t: 25, v: 9 },
    ]);
    expect(withLatest(points, null)).toEqual(points);
  });

  it('finds the busiest sample', () => {
    expect(peakOf([])).toBeNull();
    expect(
      peakOf([
        { t: 1, v: 5 },
        { t: 2, v: 9 },
        { t: 3, v: 4 },
      ]),
    ).toEqual({ t: 2, v: 9 });
  });

  it('thins the table to the newest sample and every nth one before it', () => {
    const download = Array.from({ length: 7 }, (_, index) => ({ t: index, v: index }));
    const upload = download.map((point) => ({ t: point.t, v: point.v / 2 }));
    expect(tableRows(download, upload, 3).map((row) => row.at)).toEqual([0, 3, 6]);
    expect(tableRows(download, upload, 3)[2]).toEqual({ at: 6, download: 6, upload: 3 });
    expect(tableRows(download, [], 3)[0]).toEqual({ at: 0, download: 0, upload: null });
    expect(tableStep(100, 24)).toBe(5);
    expect(tableStep(3, 24)).toBe(1);
  });
});
