import { describe, expect, it } from 'vitest';
import { recordsOfType } from './records';
import { nightOf, type SleepNight } from './sleep';
import { monthRowsOf, trendOf } from './sleep-trend';
import { mixColumnsOf, usualOf, windowColumnsOf } from './sleep-trend-columns';
import { mixLineOf, scheduleStatsOf, spreadLineOf, trendStatsOf } from './sleep-trend-text';
import { at, seedRecord } from './test-support';
import { windowOf } from './window';

function stage(start: Date, end: Date, code: number): object {
  return { startTime: start.toISOString(), endTime: end.toISOString(), stage: code };
}

function sleep(start: Date, end: Date, stages: readonly object[] = []): SleepNight {
  const [record] = recordsOfType(
    [seedRecord({ type: 'SleepSession', start, end, data: { title: null, notes: null, stages } })],
    'SleepSession',
  );
  return nightOf(record!);
}

function night(day: number, bedHour: number, wakeHour: number): SleepNight {
  return sleep(at(day - 1, bedHour), at(day, wakeHour));
}

function staged(day: number): SleepNight {
  return sleep(at(day - 1, 23), at(day, 7), [
    stage(at(day - 1, 23), at(day, 1), 4),
    stage(at(day, 1), at(day, 3), 5),
    stage(at(day, 3), at(day, 5), 6),
    stage(at(day, 5), at(day, 7), 4),
  ]);
}

const WEEK = windowOf('week', '2026-10-08');
const nights = [staged(5), staged(6), night(7, 23, 5), staged(9)];
const trend = trendOf(nights, [night(1, 23, 7), night(2, 23, 7)], WEEK);

describe('schedule columns', () => {
  it('has one column per day with clock minutes and explicit missing nights', () => {
    const columns = windowColumnsOf(trend, null);
    expect(columns).toHaveLength(7);
    expect(columns[0]?.night).toEqual({ bed: 23 * 60, wake: 7 * 60, asleepMinutes: 480 });
    expect(columns[3]?.night).toBeNull();
    expect(columns.every((column) => column.nap === null)).toBe(true);
  });

  it('puts a nap in its day column as clock minutes', () => {
    const withNap = trendOf([staged(6), sleep(at(6, 14), at(6, 15))], [], WEEK);
    expect(windowColumnsOf(withNap, null)[1]?.nap).toEqual({ start: 14 * 60, end: 15 * 60 });
  });

  it('uses month medians for a year and keeps empty months missing', () => {
    const year = windowOf('year', '2026-10-08');
    const months = monthRowsOf([staged(6), staged(7)], year);
    const columns = windowColumnsOf(trendOf([staged(6), staged(7)], [], year), months);
    expect(columns).toHaveLength(12);
    expect(columns[9]?.night).toEqual({ bed: 23 * 60, wake: 7 * 60, asleepMinutes: 480 });
    expect(columns[0]?.night).toBeNull();
  });

  it('reads the usual times from the pattern', () => {
    expect(usualOf(trend.pattern)).toEqual({ bed: 23 * 60, wake: 7 * 60 });
    expect(usualOf(null)).toBeNull();
  });
});

describe('time asleep columns', () => {
  it('keeps stage minutes for staged nights and none for unstaged ones', () => {
    const columns = mixColumnsOf(trend, null);
    expect(columns[0]?.night).toEqual({ asleep: 480, stages: { deep: 120, light: 240, rem: 120 } });
    expect(columns[2]?.night).toEqual({ asleep: 360, stages: null });
    expect(columns[3]?.night).toBeNull();
  });

  it('turns month shares into minutes of the monthly average', () => {
    const year = windowOf('year', '2026-10-08');
    const months = monthRowsOf([staged(6), staged(7)], year);
    const column = mixColumnsOf(trendOf([staged(6), staged(7)], [], year), months)[9];
    expect(column?.night?.asleep).toBe(480);
    expect(column?.night?.stages?.deep).toBeCloseTo(120);
    expect(mixColumnsOf(trend, months)[0]?.night).toBeNull();
  });
});

describe('card text', () => {
  it('lists the schedule numbers with the counted nights', () => {
    const stats = scheduleStatsOf(trend.pattern!);
    expect(stats.map((stat) => stat.label)).toEqual([
      'Usual bedtime',
      'Usual wake-up',
      'Average asleep',
      'On schedule',
    ]);
    expect(stats[0]?.value).toMatch(/11:00/);
    expect(stats[2]?.value).toBe('7h 30m');
    expect(stats[3]?.value).toBe('75% · 3 of 4 nights');
  });

  it('words the bedtime spread with the recorded count', () => {
    expect(spreadLineOf(40, 6, 7)).toBe(
      'Bedtime varies by about 40 minutes · 6 of 7 nights recorded',
    );
    expect(spreadLineOf(0, 6, 7)).toBe(
      'Bedtime varies by under 5 minutes · 6 of 7 nights recorded',
    );
  });

  it('keeps average, total, comparison and best night with a date', () => {
    const stats = trendStatsOf(trend, null, 'week');
    expect(stats.map((stat) => stat.label)).toEqual([
      'Average per night',
      'Total asleep',
      'Per night vs last week',
      'Best night',
    ]);
    expect(stats[0]).toMatchObject({ value: '7h 30m', note: '4 of 7 nights' });
    expect(stats[1]?.value).toBe('30h 00m');
    expect(stats[2]?.value).toBe('30m less');
    expect(stats[3]?.value).toMatch(/^Mon 5 · 8h 00m$/);
  });

  it('dates the best night in a month and names the best month in a year', () => {
    const month = windowOf('month', '2026-10-08');
    const monthTrend = trendOf(nights, [], month);
    expect(trendStatsOf(monthTrend, null, 'month').at(-1)?.value).toMatch(/^Oct 5 · 8h 00m$/);
    const year = windowOf('year', '2026-10-08');
    const best = trendStatsOf(trendOf(nights, [], year), monthRowsOf(nights, year), 'year').at(-1);
    expect(best).toMatchObject({ label: 'Best month', value: 'Oct · 7h 30m' });
  });

  it('prints the stage mix rounded to whole percents', () => {
    expect(mixLineOf({ deep: 0.2111, light: 0.5444, rem: 0.2333 })).toBe(
      'Deep 21% · Light 54% · REM 23% on average',
    );
  });
});
