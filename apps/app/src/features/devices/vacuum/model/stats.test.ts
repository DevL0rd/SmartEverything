import { describe, expect, it } from 'vitest';
import { bucketIndexOf, canStepForward, periodAt, shiftPeriod, weekStartOf } from './stats-period';
import { lifetimeOf, roomHistoryOf, statsOf, weeklyOf, type StatsClean } from './stats-series';

function at(month: number, day: number, hour = 9): string {
  return new Date(2026, month - 1, day, hour).toISOString();
}

function clean(when: string, extra: Partial<StatsClean> = {}): StatsClean {
  return {
    startedAt: when,
    seconds: 1800,
    areaM2: 30,
    scope: 'global',
    mode: 'sweep_mop',
    rooms: [],
    outcome: 'finished',
    ...extra,
  };
}

describe('stats periods', () => {
  it('starts a week on Monday and has seven day buckets', () => {
    const period = periodAt('week', new Date(2026, 9, 24, 15).getTime());
    expect(new Date(period.startMs).getDay()).toBe(1);
    expect(new Date(period.startMs).getDate()).toBe(19);
    expect(period.bucketStarts).toHaveLength(7);
    expect(period.label).toBe('19 Oct to 25 Oct');
    expect(weekStartOf(new Date(2026, 9, 25, 23).getTime())).toBe(period.startMs);
  });

  it('has one bucket per day of the month and twelve months in a year', () => {
    expect(periodAt('month', new Date(2026, 1, 10).getTime()).bucketStarts).toHaveLength(28);
    expect(periodAt('month', new Date(2026, 9, 10).getTime())).toMatchObject({
      label: 'October 2026',
    });
    const year = periodAt('year', new Date(2026, 9, 10).getTime());
    expect(year.bucketStarts).toHaveLength(12);
    expect(year.label).toBe('2026');
  });

  it('steps back and forward by one period', () => {
    const week = periodAt('week', new Date(2026, 9, 24).getTime());
    expect(new Date(shiftPeriod(week, -1).startMs).getDate()).toBe(12);
    expect(shiftPeriod(shiftPeriod(week, -1), 1)).toStrictEqual(week);
    const month = periodAt('month', new Date(2026, 0, 15).getTime());
    expect(shiftPeriod(month, -1).label).toBe('December 2025');
    expect(shiftPeriod(periodAt('year', new Date(2026, 5, 1).getTime()), -1).label).toBe('2025');
  });

  it('allows stepping forward only past a finished period', () => {
    const now = new Date(2026, 9, 24).getTime();
    const week = periodAt('week', now);
    expect(canStepForward(week, now)).toBe(false);
    expect(canStepForward(shiftPeriod(week, -1), now)).toBe(true);
  });

  it('finds the bucket of a moment and nothing outside the period', () => {
    const week = periodAt('week', new Date(2026, 9, 24).getTime());
    expect(bucketIndexOf(week, new Date(2026, 9, 19, 0, 0).getTime())).toBe(0);
    expect(bucketIndexOf(week, new Date(2026, 9, 21, 23, 59).getTime())).toBe(2);
    expect(bucketIndexOf(week, new Date(2026, 9, 18, 23, 59).getTime())).toBeNull();
    expect(bucketIndexOf(week, new Date(2026, 9, 26, 0, 0).getTime())).toBeNull();
  });
});

describe('stats series', () => {
  const week = periodAt('week', new Date(2026, 9, 24).getTime());

  it('sums area, time and cleans per day and over the period', () => {
    const stats = statsOf(
      [
        clean(at(10, 19)),
        clean(at(10, 19, 15), { areaM2: 10, seconds: 600 }),
        clean(at(10, 22), { areaM2: 50, seconds: 3000 }),
        clean(at(10, 12)),
      ],
      week,
    );
    expect(stats.buckets.map((bucket) => bucket.cleans)).toStrictEqual([2, 0, 0, 1, 0, 0, 0]);
    expect(stats.buckets[0]).toMatchObject({ areaM2: 40, seconds: 2400 });
    expect(stats.totals).toMatchObject({ cleans: 3, areaM2: 90, seconds: 5400 });
    expect(stats.totals.averageSeconds).toBe(1800);
    expect(stats.totals.averageAreaM2).toBe(30);
    expect(stats.peakAreaIndex).toBe(3);
    expect(stats.peakSecondsIndex).toBe(3);
    expect(stats.empty).toBe(false);
  });

  it('is empty with no averages and no peaks when nothing was cleaned', () => {
    const stats = statsOf([clean(at(9, 1))], week);
    expect(stats.empty).toBe(true);
    expect(stats.totals).toMatchObject({ cleans: 0, averageSeconds: null, averageAreaM2: null });
    expect(stats.peakAreaIndex).toBeNull();
  });

  it('buckets a year by month', () => {
    const stats = statsOf(
      [clean(at(1, 5)), clean(at(1, 20)), clean(at(10, 3))],
      periodAt('year', new Date(2026, 5, 1).getTime()),
    );
    expect(stats.buckets.map((bucket) => bucket.cleans)).toStrictEqual([
      2, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0,
    ]);
  });

  it('splits weeks into vacuum and mop cleans and counts errors', () => {
    const month = periodAt('month', new Date(2026, 9, 10).getTime());
    const weeks = weeklyOf(
      [
        clean(at(10, 1), { mode: 'sweep' }),
        clean(at(10, 6), { mode: 'sweep' }),
        clean(at(10, 7), { mode: 'sweep_then_mop', outcome: 'error' }),
        clean(at(10, 8), { mode: null }),
        clean(at(10, 20), { mode: 'sweep_mop' }),
      ],
      month,
    );
    expect(weeks.map((row) => new Date(row.startMs).getDate())).toStrictEqual([28, 5, 12, 19, 26]);
    expect(weeks.map((row) => [row.vacuumCleans, row.mopCleans, row.errors])).toStrictEqual([
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
      [0, 1, 0],
      [0, 0, 0],
    ]);
  });

  it('shows per room how often and how long ago it was cleaned', () => {
    const now = new Date(2026, 9, 24, 12).getTime();
    const rows = roomHistoryOf(
      [
        clean(at(10, 19), { scope: 'rooms', rooms: [{ id: 3, name: 'Kitchen' }] }),
        clean(at(10, 20), { scope: 'global', rooms: [] }),
        clean(at(10, 21), { scope: 'zone', rooms: [] }),
        clean(at(10, 5), { scope: 'rooms', rooms: [{ id: 4, name: 'Hall' }] }),
      ],
      [
        { id: 3, name: 'Kitchen' },
        { id: 4, name: 'Hall' },
        { id: 5, name: 'Study' },
      ],
      week,
      now,
    );
    expect(rows[0]).toMatchObject({ id: 3, cells: [1, 1, 0, 0, 0, 0, 0], daysSince: 4 });
    expect(rows[1]).toMatchObject({ id: 4, cells: [0, 1, 0, 0, 0, 0, 0], daysSince: 4 });
    expect(rows[2]).toMatchObject({ id: 5, cells: [0, 1, 0, 0, 0, 0, 0], daysSince: 4 });
    const old = roomHistoryOf(
      [clean(at(10, 5), { scope: 'rooms', rooms: [{ id: 4, name: 'Hall' }] })],
      [{ id: 4, name: 'Hall' }],
      week,
      now,
    );
    expect(old[0]).toMatchObject({ cells: [0, 0, 0, 0, 0, 0, 0], daysSince: 19 });
    const never = roomHistoryOf([], [{ id: 4, name: 'Hall' }], week, now);
    expect(never[0]).toMatchObject({ lastCleanedMs: null, daysSince: null });
  });

  it('reads lifetime totals and ignores values that are not counts', () => {
    expect(lifetimeOf({ vacuum_total_cleans: 120, vacuum_total_seconds: 9000 })).toStrictEqual({
      cleans: 120,
      minutes: 9000,
    });
    expect(lifetimeOf({ vacuum_total_cleans: 'many' })).toStrictEqual({
      cleans: null,
      minutes: null,
    });
  });
});
