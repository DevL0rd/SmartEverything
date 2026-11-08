import {
  PLANNER_COLLECTION_ROW,
  PLANNER_DAY,
  PLANNER_ITEM_ROW,
  PLANNER_OCCURRENCE_ROW,
  PLANNER_STATS,
  type PlannerCollectionRow,
  type PlannerDay,
  type PlannerItemRow,
  type PlannerOccurrenceRow,
  type PlannerStats,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { clock, shiftDay, shortDate, startOfDayKey, weekdayShort } from '../../../format/time';
import {
  ALL_OPEN,
  dueLabelOf,
  isOverdue,
  listTrendOf,
  matchesFilter,
  smartChipsOf,
  smartCountOf,
  taskEntriesOf,
  taskGroupsOf,
  taskListRowsOf,
  todayKeysOf,
  type TaskEntry,
  type TaskFilter,
} from './task-grouping';

const PROFILE = 'a1b2c3d4-0000-4000-8000-000000000001';
const HOME = 'a1b2c3d4-0000-4000-8000-0000000000c1';
const WORK = 'a1b2c3d4-0000-4000-8000-0000000000c2';
const STAMP = '2026-11-01T08:00:00.000Z';
const TODAY = '2026-11-07';
const ZONE = 'Europe/Berlin';

let next = 0;

function id(): string {
  next += 1;
  return `a1b2c3d4-0000-4000-8000-${String(next).padStart(12, '0')}`;
}

function task(title: string, extra: Partial<PlannerItemRow> = {}): PlannerItemRow {
  return PLANNER_ITEM_ROW.parse({
    id: id(),
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

function habit(title: string): PlannerItemRow {
  return task(title, {
    rrule: 'FREQ=DAILY',
    start_local: '2026-11-01T07:30:00',
    time_zone: ZONE,
  });
}

function list(listId: string, name: string, position: number): PlannerCollectionRow {
  return PLANNER_COLLECTION_ROW.parse({
    id: listId,
    profile_id: PROFILE,
    kind: 'list',
    name,
    colour: 'home',
    icon: 'house',
    position,
    visible: true,
    default_reminders: [],
    source: 'local',
    google: null,
    created_at: STAMP,
    updated_at: STAMP,
  });
}

function occurrence(
  itemId: string,
  key: string,
  status: PlannerOccurrenceRow['status'],
): PlannerOccurrenceRow {
  const done = status === 'done';
  return PLANNER_OCCURRENCE_ROW.parse({
    item_id: itemId,
    occurrence_key: key,
    status,
    completed_at: done ? STAMP : null,
    completed_by: done ? 'person' : null,
    evidence: null,
    moved_start: null,
    moved_end: null,
  });
}

function dayWith(item: PlannerItemRow, key: string): PlannerDay {
  const view = {
    item_id: item.id,
    occurrence_key: key,
    collection_id: item.collection_id,
    kind: 'task',
    title: item.title,
    location: null,
    priority: null,
    all_day: false,
    start: key,
    end: null,
    due_at: null,
    due_date: null,
    status: 'open',
    recurring: true,
    moved: false,
    completed_at: null,
    completed_by: null,
    evidence: null,
    attachments: [],
    google_state: null,
  };
  return PLANNER_DAY.parse({
    date: TODAY,
    time_zone: ZONE,
    now: '2026-11-07T10:00:00.000Z',
    missed: [],
    current: [],
    upcoming: [view],
    done: [],
    happened: [],
    rings: [],
    next_alarm_at: null,
    strip: [],
  });
}

function titlesIn(entries: readonly TaskEntry[], filter: TaskFilter): readonly string[] {
  return entries.filter((entry) => matchesFilter(entry, filter, TODAY)).map((e) => e.item.title);
}

function smart(listName: Extract<TaskFilter, { kind: 'smart' }>['list']): TaskFilter {
  return { kind: 'smart', list: listName };
}

describe('taskEntriesOf and the smart lists', () => {
  const dueToday = task('Take out the recycling', { due_date: TODAY });
  const late = task('Call the dentist', { due_date: shiftDay(TODAY, -1), priority: 1 });
  const later = task('Send the invoice', { due_date: shiftDay(TODAY, 3) });
  const someday = task('Batteries for the remote');
  const device = task('Brush teeth', {
    due_date: TODAY,
    completion: {
      kind: 'signal',
      matcher: { source: 'toothbrush', kind: 'session' },
      window: 'day',
    },
  });
  const finished = task('Book the eye test', { status: 'done' });
  const step = task('Buy descaler', { parent_id: later.id, status: 'done' });
  const gone = task('Old note', { deleted_at: STAMP });
  const items = [dueToday, late, later, someday, device, finished, step, gone];
  const entries = taskEntriesOf({ items, occurrences: [], day: undefined });

  it('keeps top tasks only and counts their steps', () => {
    expect(entries.map((entry) => entry.item.title)).not.toContain('Buy descaler');
    expect(entries.map((entry) => entry.item.title)).not.toContain('Old note');
    expect(entries.find((entry) => entry.item.id === later.id)?.steps).toEqual({
      done: 1,
      total: 1,
    });
  });

  it('puts every task in the smart lists it belongs to', () => {
    expect(titlesIn(entries, smart('today'))).toEqual(['Take out the recycling', 'Brush teeth']);
    expect(titlesIn(entries, smart('overdue'))).toEqual(['Call the dentist']);
    expect(titlesIn(entries, smart('upcoming'))).toEqual(['Send the invoice']);
    expect(titlesIn(entries, smart('someday'))).toEqual(['Batteries for the remote']);
    expect(titlesIn(entries, smart('device_tasks'))).toEqual(['Brush teeth']);
    expect(titlesIn(entries, smart('completed'))).toEqual(['Book the eye test']);
    expect(smartCountOf(entries, 'all', TODAY)).toBe(5);
  });

  it('takes a done or skipped occurrence out of the open lists at once', () => {
    const optimistic = taskEntriesOf({
      items,
      occurrences: [
        occurrence(dueToday.id, 'single', 'done'),
        occurrence(late.id, 'single', 'skipped'),
      ],
      day: undefined,
    });
    expect(titlesIn(optimistic, smart('today'))).toEqual(['Brush teeth']);
    expect(titlesIn(optimistic, smart('overdue'))).toEqual([]);
    expect(titlesIn(optimistic, smart('completed'))).toContain('Take out the recycling');
    expect(titlesIn(optimistic, smart('completed'))).not.toContain('Call the dentist');
  });

  it('filters a user list to its open tasks', () => {
    const work = task('Review the draft', { collection_id: WORK });
    const mixed = taskEntriesOf({ items: [...items, work], occurrences: [], day: undefined });
    expect(titlesIn(mixed, { kind: 'list', id: WORK })).toEqual(['Review the draft']);
  });
});

describe('repeating tasks', () => {
  const brush = habit('Brush teeth every day');
  const key = '2026-11-07T10:00:00.000Z';

  it('is due today when the day view holds an open occurrence of it', () => {
    const [entry] = taskEntriesOf({ items: [brush], occurrences: [], day: dayWith(brush, key) });
    expect(entry?.occurrenceKey).toBe(key);
    expect(entry?.dueAt).toBe(key);
    expect(entry === undefined ? [] : titlesIn([entry], smart('today'))).toEqual([
      'Brush teeth every day',
    ]);
    expect(todayKeysOf(dayWith(brush, key)).get(brush.id)).toBe(key);
  });

  it('leaves Today once that occurrence is done but stays a habit', () => {
    const entries = taskEntriesOf({
      items: [brush],
      occurrences: [occurrence(brush.id, key, 'done')],
      day: dayWith(brush, key),
    });
    expect(titlesIn(entries, smart('today'))).toEqual([]);
    expect(titlesIn(entries, smart('habits'))).toEqual(['Brush teeth every day']);
    expect(titlesIn(entries, smart('someday'))).toEqual([]);
    const [entry] = entries;
    expect(entry?.occurrenceKey).toBeNull();
    expect(entry === undefined ? '' : dueLabelOf(entry, TODAY)).toBe('Not due today');
  });
});

describe('taskGroupsOf and taskListRowsOf', () => {
  const collections = [list(WORK, 'Work', 1), list(HOME, 'Home', 0)];
  const a = task('Later at home', { due_date: shiftDay(TODAY, 2) });
  const b = task('Urgent at home', { due_date: TODAY, priority: 1 });
  const c = task('Low at home', { due_date: TODAY, priority: 3 });
  const d = task('Work thing', { collection_id: WORK });

  it('groups by list in list order and sorts by due date then priority', () => {
    const entries = taskEntriesOf({ items: [a, b, c, d], occurrences: [], day: undefined });
    const groups = taskGroupsOf({ entries, filter: ALL_OPEN, collections, today: TODAY });
    expect(groups.map((group) => group.collection?.name)).toEqual(['Home', 'Work']);
    expect(groups[0]?.entries.map((entry) => entry.item.title)).toEqual([
      'Urgent at home',
      'Low at home',
      'Later at home',
    ]);
    const rows = taskListRowsOf(groups);
    expect(rows.map((row) => (row.kind === 'head' ? 'head' : row.edge))).toEqual([
      'head',
      'first',
      'middle',
      'last',
      'head',
      'only',
    ]);
  });

  it('shows the latest finished task first in Completed', () => {
    const old = task('Old', { status: 'done', updated_at: '2026-11-02T08:00:00.000Z' });
    const fresh = task('Fresh', { status: 'done', updated_at: '2026-11-06T08:00:00.000Z' });
    const entries = taskEntriesOf({ items: [old, fresh], occurrences: [], day: undefined });
    const [group] = taskGroupsOf({
      entries,
      filter: smart('completed'),
      collections,
      today: TODAY,
    });
    expect(group?.entries.map((entry) => entry.item.title)).toEqual(['Fresh', 'Old']);
  });
});

describe('smartChipsOf', () => {
  it('starts with All open, then the shown smart lists in their own order', () => {
    expect(smartChipsOf(['completed', 'today', 'habits']).map((chip) => chip.label)).toEqual([
      'All open',
      'Today',
      'Habits',
      'Completed',
    ]);
  });
});

describe('dueLabelOf and isOverdue', () => {
  const base = task('Any');

  it('names the day in words near today', () => {
    const label = (dueDay: string | null): string =>
      dueLabelOf({ item: base, dueDay, dueAt: null }, TODAY);
    expect(label(TODAY)).toBe('Today');
    expect(label(shiftDay(TODAY, 1))).toBe('Tomorrow');
    expect(label(shiftDay(TODAY, -1))).toBe('Yesterday');
    expect(label(shiftDay(TODAY, 4))).toBe(weekdayShort(startOfDayKey(shiftDay(TODAY, 4))));
    expect(label(shiftDay(TODAY, 20))).toBe(shortDate(startOfDayKey(shiftDay(TODAY, 20))));
    expect(label(null)).toBe('No date');
  });

  it('adds the time and turns overdue once the due moment passes', () => {
    const dueAt = new Date(startOfDayKey(TODAY) + 12 * 3_600_000).toISOString();
    const entry = taskEntriesOf({
      items: [task('Drink water', { due_at: dueAt })],
      occurrences: [],
      day: undefined,
    })[0];
    expect(entry === undefined ? '' : dueLabelOf(entry, TODAY)).toBe(`Today ${clock(dueAt)}`);
    expect(entry === undefined ? null : isOverdue(entry, Date.parse(dueAt) - 1, TODAY)).toBe(false);
    expect(entry === undefined ? null : isOverdue(entry, Date.parse(dueAt) + 1, TODAY)).toBe(true);
  });
});

function statsWith(points: readonly { done: number; due: number }[]): PlannerStats {
  const days = points.map((point, index) => ({ day: shiftDay('2026-10-01', index), ...point }));
  return PLANNER_STATS.parse({
    range: 'month',
    from: '2026-10-01',
    to: shiftDay('2026-10-01', Math.max(0, points.length - 1)),
    completion: { done: 0, due: 0 },
    on_time: { on_time: 0, late: 0 },
    streaks: { current: 0, longest: 0 },
    best_hours: [],
    time_by_calendar: [],
    weekly_load: [],
    device_share: { by_device: 0, by_hand: 0 },
    list_trends: [{ collection_id: HOME, points: days }],
    timer_use: [],
    alarms: [],
  });
}

describe('listTrendOf', () => {
  it('turns daily tallies into a weekly completion share, newest week last', () => {
    const week = (done: number, due: number): { done: number; due: number }[] =>
      Array.from({ length: 7 }, () => ({ done, due }));
    const trend = listTrendOf(statsWith([...week(0, 1), ...week(1, 1), ...week(1, 2)]), HOME);
    expect(trend).toEqual({
      weeks: 3,
      points: [
        { t: 0, v: 0 },
        { t: 1, v: 1 },
        { t: 2, v: 0.5 },
      ],
    });
  });

  it('leaves out weeks with nothing due and draws nothing without two weeks to compare', () => {
    const week = (due: number): { done: number; due: number }[] =>
      Array.from({ length: 7 }, () => ({ done: 0, due }));
    expect(listTrendOf(statsWith([...week(0), ...week(1)]), HOME)).toBeNull();
    expect(listTrendOf(statsWith(week(1)), WORK)).toBeNull();
    expect(listTrendOf(undefined, HOME)).toBeNull();
  });
});
