import {
  PLANNER_COLLECTION_ROW,
  PLANNER_STATS,
  type PlannerCollectionRow,
  type PlannerStats,
  type PlannerStatsRange,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { shiftDay, shortDate, startOfDayKey } from '../../../format/time';
import {
  bestDayOf,
  calendarSlicesOf,
  dayBarsOf,
  doneByDayOf,
  hasInsights,
  heatDaysOf,
  heatSplitOf,
  hourBarsOf,
  hourWindowOf,
  loadBarsOf,
  loadBucketsOf,
  peakHourOf,
  rangeDaysOf,
  rangeLabelOf,
} from './insights-model';
import { changeFactsOf, changePromptOf, changeTitleOf, kpisOf } from './summary-model';

const PROFILE = 'a1b2c3d4-0000-4000-8000-000000000001';
const WORK = 'a1b2c3d4-0000-4000-8000-0000000000c1';
const FAMILY = 'a1b2c3d4-0000-4000-8000-0000000000c2';
const GONE = 'a1b2c3d4-0000-4000-8000-0000000000c9';
const STAMP = '2026-11-01T08:00:00.000Z';
const LAST = '2026-11-08';
const LENGTH: Readonly<Record<PlannerStatsRange, number>> = { week: 7, month: 30, year: 365 };

function daysOf(range: PlannerStatsRange): readonly string[] {
  const length = LENGTH[range];
  return Array.from({ length }, (_, index) => shiftDay(LAST, index - length + 1));
}

function statsOf(range: PlannerStatsRange, extra: Partial<PlannerStats> = {}): PlannerStats {
  const days = daysOf(range);
  return PLANNER_STATS.parse({
    range,
    from: days[0],
    to: LAST,
    completion: { done: 0, due: 0 },
    on_time: { on_time: 0, late: 0 },
    streaks: { current: 0, longest: 0 },
    best_hours: Array.from({ length: 24 }, (_, hour) => ({ hour, done: 0 })),
    time_by_calendar: [],
    weekly_load: days.map((day) => ({ day, scheduled_minutes: 60, items: 1 })),
    device_share: { by_device: 0, by_hand: 0 },
    list_trends: [],
    timer_use: [],
    alarms: [],
    ...extra,
  });
}

function trend(
  id: string,
  done: Readonly<Record<string, number>>,
  range: PlannerStatsRange,
): PlannerStats['list_trends'][number] {
  return {
    collection_id: id,
    points: daysOf(range).map((day) => ({ day, done: done[day] ?? 0, due: done[day] ?? 0 })),
  };
}

function collection(id: string, name: string, colour: 'work' | 'family'): PlannerCollectionRow {
  return PLANNER_COLLECTION_ROW.parse({
    id,
    profile_id: PROFILE,
    kind: 'calendar',
    name,
    colour,
    icon: 'calendar',
    position: 0,
    visible: true,
    default_reminders: [],
    source: 'local',
    google: null,
    created_at: STAMP,
    updated_at: STAMP,
  });
}

describe('the insights done heatmap', () => {
  it('sums every list per day and scales the busiest day to the top level', () => {
    const stats = statsOf('week', {
      list_trends: [
        trend(WORK, { '2026-11-03': 2, '2026-11-05': 1 }, 'week'),
        trend(FAMILY, { '2026-11-03': 2 }, 'week'),
      ],
    });
    const days = heatDaysOf(rangeDaysOf(stats), doneByDayOf(stats), null);
    expect(days).toHaveLength(7);
    expect(days.find((day) => day.day === '2026-11-03')).toMatchObject({ pages: 4, level: 4 });
    expect(days.find((day) => day.day === '2026-11-05')).toMatchObject({ pages: 1, level: 1 });
    expect(days.find((day) => day.day === '2026-11-04')).toMatchObject({ pages: 0, level: 0 });
    expect(bestDayOf(days)?.day).toBe('2026-11-03');
    expect(dayBarsOf(days).map((bar) => bar.value)).toEqual([0, 4, 0, 1, 0, 0, 0]);
  });

  it('hatches the days before a habit existed and finds no best day when nothing is done', () => {
    const days = heatDaysOf(['2026-11-01', '2026-11-02'], new Map(), '2026-11-02');
    expect(days.map((day) => day.covered)).toEqual([false, true]);
    expect(bestDayOf(days)).toBeNull();
  });

  it('splits a year into blocks that fit the measured width', () => {
    expect(heatSplitOf(365, 1000)).toBe(1);
    expect(heatSplitOf(365, 350)).toBe(2);
    expect(heatSplitOf(7, 300)).toBe(1);
    expect(heatSplitOf(365, 0)).toBe(1);
  });
});

describe('the best hours', () => {
  it('names the busiest hour and labels the axis every six hours', () => {
    const stats = statsOf('week', {
      best_hours: Array.from({ length: 24 }, (_, hour) => ({ hour, done: hour === 9 ? 5 : 1 })),
    });
    expect(peakHourOf(stats)).toBe(9);
    expect(hourWindowOf(9)).toBe('09:00 to 10:00');
    const labelled = hourBarsOf(stats).filter((bar) => bar.label !== undefined);
    expect(labelled.map((bar) => bar.label)).toEqual(['00', '06', '12', '18']);
  });

  it('has no best hour before anything is done', () => {
    expect(peakHourOf(statsOf('week'))).toBeNull();
  });
});

describe('the time by calendar slices', () => {
  it('takes each calendar name and colour and keeps a deleted calendar as other', () => {
    const stats = statsOf('week', {
      time_by_calendar: [
        { collection_id: WORK, minutes: 360 },
        { collection_id: GONE, minutes: 30 },
      ],
    });
    const slices = calendarSlicesOf(stats, [collection(WORK, 'Work', 'work')]);
    expect(slices).toEqual([
      { key: WORK, value: 360, label: 'Work', colour: 'viz-6' },
      { key: GONE, value: 30, label: 'Other calendar', colour: 'on-surface-variant' },
    ]);
  });
});

describe('the load buckets', () => {
  it('shows one bar per day for a week', () => {
    const stats = statsOf('week', { list_trends: [trend(WORK, { [LAST]: 3 }, 'week')] });
    const buckets = loadBucketsOf(stats);
    expect(buckets).toHaveLength(7);
    expect(buckets.at(-1)).toMatchObject({ key: LAST, minutes: 60, done: 3 });
    expect(loadBarsOf(buckets).at(-1)?.value).toBe(1);
  });

  it('groups a month into weeks that end on the last day', () => {
    const buckets = loadBucketsOf(statsOf('month'));
    expect(buckets).toHaveLength(5);
    expect(buckets.at(-1)).toMatchObject({ key: shiftDay(LAST, -6), minutes: 420 });
    expect(buckets[0]?.minutes).toBe(120);
  });

  it('covers the whole year in weeks', () => {
    const buckets = loadBucketsOf(statsOf('year'));
    expect(buckets).toHaveLength(53);
    expect(buckets.reduce((sum, bucket) => sum + bucket.minutes, 0)).toBe(365 * 60);
  });
});

describe('the KPI strip', () => {
  it('shows done, on time, streak, device share and missed', () => {
    const stats = statsOf('week', {
      completion: { done: 23, due: 27 },
      on_time: { on_time: 19, late: 4 },
      streaks: { current: 3, longest: 14 },
      device_share: { by_device: 9, by_hand: 14 },
    });
    const items = kpisOf(stats, []);
    expect(items.map((item) => [item.label, item.value])).toEqual([
      ['Done', '23'],
      ['On time', '83 %'],
      ['Longest streak', '14'],
      ['Done by devices', '39 %'],
      ['Missed', '4'],
    ]);
    expect(items.find((item) => item.key === 'missed')?.tone).toBe('critical');
  });

  it('marks the shares as not known yet when nothing finished', () => {
    const items = kpisOf(statsOf('week'), []);
    expect(items.find((item) => item.key === 'on-time')).toMatchObject({ value: '–', stale: true });
    expect(items.find((item) => item.key === 'devices')).toMatchObject({ value: '–', stale: true });
    expect(items.find((item) => item.key === 'missed')?.tone).toBeUndefined();
  });
});

describe('the what changed card', () => {
  it('states the facts of the range and asks the AI to compare without adding anything', () => {
    const stats = statsOf('month', {
      completion: { done: 20, due: 25 },
      on_time: { on_time: 15, late: 5 },
      best_hours: Array.from({ length: 24 }, (_, hour) => ({ hour, done: hour === 8 ? 4 : 0 })),
    });
    const slices = [{ key: WORK, value: 90, label: 'Work', colour: 'viz-6' as const }];
    expect(changeTitleOf(stats)).toBe('What changed this month');
    expect(changeFactsOf(stats, slices)).toBe(
      '20 of 25 done, on time 75 %. Most done from 08:00 to 09:00. Work took the most time, 1.5 h.',
    );
    expect(changePromptOf(stats)).toContain('with the month before');
    expect(changePromptOf(stats)).toContain("don't add anything until I accept");
  });
});

describe('the empty insights page', () => {
  it('waits for a finished task, a timed event or an alarm', () => {
    expect(hasInsights(statsOf('week'))).toBe(false);
    expect(hasInsights(statsOf('week', { completion: { done: 0, due: 1 } }))).toBe(true);
    expect(
      hasInsights(statsOf('week', { time_by_calendar: [{ collection_id: WORK, minutes: 30 }] })),
    ).toBe(true);
  });
});

describe('the range line', () => {
  it('names the years only when the range crosses one', () => {
    const date = (day: string): string => shortDate(startOfDayKey(day));
    expect(rangeLabelOf(statsOf('week'))).toBe(`${date('2026-11-02')} to ${date(LAST)}`);
    expect(rangeLabelOf(statsOf('year'))).toBe(`${date('2025-11-09')} 2025 to ${date(LAST)} 2026`);
  });
});
