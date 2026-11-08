import {
  PLANNER_ITEM_ROW,
  PLANNER_OCCURRENCE_ROW,
  type PlannerItemRow,
  type PlannerOccurrenceRow,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { calendarCells } from '../../../components/charts/heatmap-model';
import { shiftDay, startOfDayKey } from '../../../format/time';
import {
  habitEntriesOf,
  habitHeatOf,
  habitStreakOf,
  heatFirstDayOf,
  heatWindowOf,
  repeatWordsOf,
  streakWordsOf,
} from './habits';
import { ALL_OPEN, taskEntriesOf } from './task-grouping';

const PROFILE = 'a1b2c3d4-0000-4000-8000-000000000001';
const HOME = 'a1b2c3d4-0000-4000-8000-0000000000c1';
const HEALTH = 'a1b2c3d4-0000-4000-8000-0000000000c2';
const ITEM = 'a1b2c3d4-0000-4000-8000-000000000101';
const STAMP = '2026-11-01T08:00:00.000Z';
const TODAY = '2026-11-07';

let next = 200;

function task(title: string, extra: Partial<PlannerItemRow> = {}): PlannerItemRow {
  next += 1;
  return PLANNER_ITEM_ROW.parse({
    id: `a1b2c3d4-0000-4000-8000-${String(next).padStart(12, '0')}`,
    profile_id: PROFILE,
    collection_id: HOME,
    kind: 'task',
    parent_id: null,
    title,
    notes: '',
    location: null,
    priority: null,
    tags: [],
    estimate_minutes: null,
    start_local: null,
    end_local: null,
    time_zone: null,
    all_day: false,
    due_date: null,
    due_at: null,
    rrule: null,
    exdates: [],
    series_id: null,
    original_start: null,
    start: null,
    end: null,
    series_end: null,
    status: 'open',
    position: 0,
    completion: { kind: 'manual' },
    attachments: [],
    reminders: [],
    google: null,
    created_by: 'person',
    created_at: STAMP,
    updated_at: STAMP,
    deleted_at: null,
    ...extra,
  });
}

function habit(title: string, extra: Partial<PlannerItemRow> = {}): PlannerItemRow {
  return task(title, {
    rrule: 'FREQ=DAILY',
    start_local: '2026-11-01T07:30:00',
    time_zone: 'Europe/Berlin',
    ...extra,
  });
}

type Status = PlannerOccurrenceRow['status'];

function on(day: string, status: Status, hour = 7): PlannerOccurrenceRow {
  const done = status === 'done';
  const key = new Date(startOfDayKey(day) + hour * 3_600_000).toISOString();
  return PLANNER_OCCURRENCE_ROW.parse({
    item_id: ITEM,
    occurrence_key: key,
    status,
    completed_at: done ? key : null,
    completed_by: done ? 'person' : null,
    evidence: null,
    moved_start: null,
    moved_end: null,
  });
}

function days(statuses: readonly Status[]): readonly PlannerOccurrenceRow[] {
  return statuses.map((status, index) => on(shiftDay(TODAY, index - statuses.length), status));
}

describe('the habit streak', () => {
  it('counts the done occurrences since the last missed one', () => {
    expect(habitStreakOf(days(['done', 'missed', 'done', 'done', 'done']))).toEqual({
      current: 3,
      longest: 3,
    });
  });

  it('keeps the longest run after a miss resets the current one', () => {
    expect(habitStreakOf(days(['done', 'done', 'done', 'done', 'missed']))).toEqual({
      current: 0,
      longest: 4,
    });
  });

  it('lets a skipped occurrence pass without breaking or counting', () => {
    expect(habitStreakOf(days(['done', 'skipped', 'done']))).toEqual({ current: 2, longest: 2 });
  });

  it('orders the rows by time, not by how they arrive', () => {
    const rows = [...days(['missed', 'done', 'done'])].reverse();
    expect(habitStreakOf(rows).current).toBe(2);
  });

  it('counts each occurrence of a twice a day habit', () => {
    const twice = [on('2026-11-06', 'done', 7), on('2026-11-06', 'done', 22), on(TODAY, 'done')];
    expect(habitStreakOf(twice).current).toBe(3);
  });

  it('says the streak in words', () => {
    expect(streakWordsOf({ current: 0, longest: 0 })).toBe('No streak yet');
    expect(streakWordsOf({ current: 0, longest: 4 })).toBe('Best 4 in a row');
    expect(streakWordsOf({ current: 14, longest: 14 })).toBe('14 in a row');
  });
});

describe('the habit heatmap', () => {
  it('fills whole weeks ending today, starting on a Monday as the kit heatmap does', () => {
    const window = heatWindowOf(TODAY, 3, 0);
    const first = heatFirstDayOf(window);
    expect(new Date(startOfDayKey(first)).getDay()).toBe(1);
    const heat = habitHeatOf({ occurrences: [], since: '2026-01-01', window });
    expect(heat.at(-1)?.day).toBe(TODAY);
    expect(heat[0]?.day).toBe(first);
    expect(calendarCells(heat, TODAY).at(-1)?.column).toBe(2);
    expect(heat.length).toBe(14 + ((new Date(startOfDayKey(TODAY)).getDay() + 6) % 7) + 1);
  });

  it('shades a day by how many occurrences were done and hatches days before the habit', () => {
    const occurrences = [
      on('2026-11-06', 'done', 7),
      on('2026-11-06', 'done', 22),
      on(TODAY, 'done'),
      on('2026-11-05', 'missed'),
    ];
    const heat = habitHeatOf({
      occurrences,
      since: '2026-11-03',
      window: heatWindowOf(TODAY, 2, 0),
    });
    const level = (day: string): number | undefined => heat.find((cell) => cell.day === day)?.level;
    expect(level('2026-11-06')).toBe(4);
    expect(level(TODAY)).toBe(2);
    expect(level('2026-11-05')).toBe(0);
    expect(heat.find((cell) => cell.day === '2026-11-02')?.covered).toBe(false);
    expect(heat.find((cell) => cell.day === '2026-11-03')?.covered).toBe(true);
  });

  it('pages back a week at a time until the habit began', () => {
    const window = heatWindowOf(TODAY, 1, 2);
    expect(window.end).toBe(shiftDay(TODAY, -14));
    expect(heatFirstDayOf(window)).toBe('2026-10-19');
  });
});

describe('habit entries and repeat words', () => {
  it('lists only the repeating open tasks, inside a chosen list', () => {
    const brush = habit('Brush teeth', { collection_id: HEALTH });
    const water = habit('Water the plants');
    const once = task('Call the dentist', { due_date: TODAY });
    const entries = taskEntriesOf({ items: [brush, water, once], occurrences: [], day: undefined });
    const titles = (filter: Parameters<typeof habitEntriesOf>[1]): readonly string[] =>
      habitEntriesOf(entries, filter, TODAY).map((entry) => entry.item.title);
    expect(titles(ALL_OPEN)).toEqual(['Brush teeth', 'Water the plants']);
    expect(titles({ kind: 'list', id: HEALTH })).toEqual(['Brush teeth']);
  });

  it('words the common repeat rules', () => {
    expect(repeatWordsOf('FREQ=DAILY')).toBe('Every day');
    expect(repeatWordsOf('FREQ=DAILY;BYHOUR=7,22')).toBe('Twice a day');
    expect(repeatWordsOf('FREQ=DAILY;INTERVAL=2')).toBe('Every 2 days');
    expect(repeatWordsOf('FREQ=WEEKLY;BYDAY=TU,TH,SA')).toBe('Tue, Thu, Sat');
    expect(repeatWordsOf('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')).toBe('Weekdays');
    expect(repeatWordsOf('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO')).toBe('Every 2 weeks on Mon');
    expect(repeatWordsOf('FREQ=MONTHLY')).toBe('Every month');
  });
});
