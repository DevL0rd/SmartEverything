import { describe, expect, it } from 'vitest';
import { recordsOfType } from './records';
import { nightOf, type SleepNight } from './sleep';
import {
  averageOf,
  bedtimeSpreadOf,
  bestNightOf,
  comparisonOf,
  monthRowsOf,
  nightRowsOf,
  stageMixOf,
  trendOf,
} from './sleep-trend';
import { at, seedRecord } from './test-support';
import { windowOf } from './window';

function stage(start: Date, end: Date, code: number): object {
  return { startTime: start.toISOString(), endTime: end.toISOString(), stage: code };
}

function night(
  day: number,
  bedHour: number,
  wakeHour: number,
  stages: readonly object[] = [],
): SleepNight {
  const [record] = recordsOfType(
    [
      seedRecord({
        type: 'SleepSession',
        start: at(day - 1, bedHour),
        end: at(day, wakeHour),
        data: { title: null, notes: null, stages },
      }),
    ],
    'SleepSession',
  );
  return nightOf(record!);
}

function napOn(day: number): SleepNight {
  const [record] = recordsOfType(
    [
      seedRecord({
        type: 'SleepSession',
        start: at(day, 14),
        end: at(day, 15),
        data: { title: null, notes: null, stages: [] },
      }),
    ],
    'SleepSession',
  );
  return nightOf(record!);
}

function staged(day: number): SleepNight {
  return night(day, 23, 7, [
    stage(at(day - 1, 23), at(day, 1), 4),
    stage(at(day, 1), at(day, 2, 30), 5),
    stage(at(day, 2, 30), at(day, 3), 1),
    stage(at(day, 3), at(day, 5), 6),
    stage(at(day, 5), at(day, 7), 4),
  ]);
}

const WEEK = windowOf('week', '2026-10-08');

describe('night rows', () => {
  it('has one row per day of the window with missing nights explicit', () => {
    const rows = nightRowsOf([staged(6), night(8, 23, 6), night(8, 23, 6)], WEEK);
    expect(rows.map((row) => row.day)).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ]);
    expect(rows.map((row) => row.night !== null)).toEqual([
      false,
      true,
      false,
      true,
      false,
      false,
      false,
    ]);
  });

  it('keeps naps on their day and never turns a nap into the night', () => {
    const nap = napOn(7);
    const rows = nightRowsOf([nap, staged(8)], WEEK);
    expect(rows[2]?.night).toBeNull();
    expect(rows[2]?.naps).toHaveLength(1);
    expect(rows[3]?.night?.asleepMinutes).toBe(450);
  });
});

describe('week figures', () => {
  const nights = [staged(5), staged(6), night(7, 23, 5), staged(9)];
  const rows = nightRowsOf(nights, WEEK);

  it('averages only recorded nights and keeps the count', () => {
    expect(averageOf(rows)).toEqual({ minutes: (450 * 3 + 360) / 4, nights: 4, of: 7 });
    expect(averageOf(nightRowsOf([], WEEK))).toBeNull();
  });

  it('finds the best night with its day, earliest first on a tie', () => {
    expect(bestNightOf(rows)).toEqual({ day: '2026-10-05', minutes: 450 });
    expect(bestNightOf(nightRowsOf([], WEEK))).toBeNull();
  });

  it('pools the stage mix over staged nights only', () => {
    const mix = stageMixOf(rows);
    expect(mix?.deep).toBeCloseTo(90 / 450);
    expect(mix?.light).toBeCloseTo(240 / 450);
    expect(mix?.rem).toBeCloseTo(120 / 450);
    expect(stageMixOf(nightRowsOf([night(6, 23, 7)], WEEK))).toBeNull();
  });

  it('compares the average per night with the previous window in words', () => {
    const before = nightRowsOf([night(1, 23, 7), night(2, 23, 7)], windowOf('week', '2026-10-01'));
    expect(comparisonOf(rows, before, 'week')).toEqual({
      deltaMinutes: -52,
      text: '52m less per night than last week',
    });
    const more = nightRowsOf([night(1, 23, 4)], windowOf('week', '2026-10-01'));
    expect(comparisonOf(rows, more, 'week')?.text).toBe('2h 08m more per night than last week');
    expect(comparisonOf(rows, nightRowsOf([], windowOf('week', '2026-10-01')), 'week')).toBeNull();
  });

  it('builds the whole trend with the pattern, spread and total', () => {
    const trend = trendOf(nights, [night(1, 23, 7), night(2, 23, 7)], WEEK);
    expect(trend.recorded).toBe(4);
    expect(trend.total).toBe(450 * 3 + 360);
    expect(trend.pattern?.nights).toBe(4);
    expect(trend.pattern?.regularNights).toBe(3);
    expect(trend.bedtimeSpread).toBe(0);
    expect(trend.comparison?.deltaMinutes).toBe(-52);
  });

  it('rounds the bedtime spread to 5 minutes', () => {
    const trend = trendOf([night(5, 22, 7), night(6, 23, 7), night(7, 22, 7)], [], WEEK);
    expect(trend.pattern).not.toBeNull();
    const spread = trend.pattern?.bedtimeSpread ?? 0;
    expect(bedtimeSpreadOf(trend.pattern!)).toBe(Math.round(spread / 5) * 5);
    expect(trend.bedtimeSpread! % 5).toBe(0);
  });
});

describe('month rows for a year', () => {
  it('summarises each month with its median times and average', () => {
    const year = windowOf('year', '2026-10-08');
    const rows = monthRowsOf([staged(6), staged(7), night(8, 22, 6)], year);
    expect(rows).toHaveLength(12);
    const october = rows[9];
    expect(october?.recorded).toBe(3);
    expect(october?.bedtime).toBe(23 * 60);
    expect(october?.wake).toBe(7 * 60);
    expect(rows[8]).toMatchObject({
      recorded: 0,
      bedtime: null,
      wake: null,
      average: null,
      mix: null,
    });
  });
});
