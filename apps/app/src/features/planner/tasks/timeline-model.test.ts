import {
  PLANNER_COLLECTION_ROW,
  PLANNER_ITEM_ROW,
  type PlannerCollectionRow,
  type PlannerItemRow,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { endOfDayKey, shiftDay, startOfDayKey } from '../../../format/time';
import { ALL_OPEN, taskEntriesOf, type TaskEntry } from './task-grouping';
import {
  barLayoutOf,
  dropDayOf,
  dueChangeOf,
  fractionOf,
  timelineBarOf,
  timelineDaysOf,
  timelineRowsOf,
  type TimelineWindow,
} from './timeline-model';

const PROFILE = 'a1b2c3d4-0000-4000-8000-000000000001';
const HOME = 'a1b2c3d4-0000-4000-8000-0000000000c1';
const WORK = 'a1b2c3d4-0000-4000-8000-0000000000c2';
const STAMP = '2026-11-01T08:00:00.000Z';
const TODAY = '2026-11-07';
const WINDOW: TimelineWindow = { from: TODAY, days: 7 };
const NOW = startOfDayKey(TODAY) + 13.5 * 3_600_000;

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

function list(collectionId: string, name: string): PlannerCollectionRow {
  return PLANNER_COLLECTION_ROW.parse({
    id: collectionId,
    profile_id: PROFILE,
    kind: 'list',
    name,
    colour: 'home',
    icon: 'house',
    position: 0,
    visible: true,
    default_reminders: [],
    source: 'local',
    google: null,
    created_at: STAMP,
    updated_at: STAMP,
  });
}

function entryOf(item: PlannerItemRow): TaskEntry {
  const [entry] = taskEntriesOf({ items: [item], occurrences: [], day: undefined });
  if (entry === undefined) throw new Error('the task has no entry');
  return entry;
}

function localAt(day: string, hours: number): string {
  return new Date(startOfDayKey(day) + hours * 3_600_000).toISOString();
}

const at = { now: NOW, today: TODAY, window: WINDOW };

describe('the timeline window', () => {
  it('maps the window start to 0 and its end to 1', () => {
    expect(fractionOf(startOfDayKey(TODAY), WINDOW)).toBe(0);
    expect(fractionOf(startOfDayKey(shiftDay(TODAY, 7)), WINDOW)).toBe(1);
    expect(fractionOf(endOfDayKey(TODAY), WINDOW)).toBeCloseTo(1 / 7, 2);
  });

  it('labels the first day and the start of a month with the date', () => {
    const days = timelineDaysOf({ from: '2026-11-28', days: 5 }, '2026-11-28');
    expect(days.map((day) => day.day)).toEqual([
      '2026-11-28',
      '2026-11-29',
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
    ]);
    expect(days[0]?.today).toBe(true);
    expect(days[0]?.label).toMatch(/ 28$/);
    expect(days[1]?.label).not.toMatch(/\d/);
    expect(days[3]?.label).toMatch(/ 1$/);
  });
});

describe('timeline bars', () => {
  it('runs a bar from the planned start to the due date', () => {
    const bar = timelineBarOf(
      entryOf(
        task('Q4 draft', { start_local: '2026-11-08', all_day: true, due_date: '2026-11-09' }),
      ),
      at,
    );
    expect(bar.tone).toBe('list');
    expect(bar.left).toBeCloseTo(1 / 7, 2);
    expect(bar.right).toBeCloseTo(3 / 7, 2);
    expect(bar.draggable).toBe(true);
  });

  it('spans only the due day when there is no planned start', () => {
    const bar = timelineBarOf(entryOf(task('Descale kettle', { due_date: '2026-11-10' })), at);
    expect(bar.left).toBeCloseTo(3 / 7, 2);
    expect(bar.right).toBeCloseTo(4 / 7, 2);
  });

  it('spans the due day when the planned start is the due time itself', () => {
    const due = localAt('2026-11-09', 17);
    const bar = timelineBarOf(
      entryOf(
        task('Recycling', {
          start_local: '2026-11-09T17:00:00',
          time_zone: 'Europe/Berlin',
          due_at: due,
        }),
      ),
      at,
    );
    expect(bar.left).toBeCloseTo(2 / 7, 2);
    expect(bar.right).toBeCloseTo(fractionOf(Date.parse(due), WINDOW), 5);
  });

  it('tints an overdue bar critical and runs it to the now line', () => {
    const bar = timelineBarOf(
      entryOf(task('Water the plants', { due_at: localAt(TODAY, 11) })),
      at,
    );
    expect(bar.tone).toBe('overdue');
    expect(bar.left).toBe(0);
    expect(bar.right).toBeCloseTo(fractionOf(NOW, WINDOW), 5);
  });

  it('clamps a task overdue since before the window to its left edge', () => {
    const bar = timelineBarOf(entryOf(task('Call the dentist', { due_date: '2026-11-03' })), at);
    expect(bar.tone).toBe('overdue');
    expect(bar.left).toBe(0);
    expect(bar.before).toBe(false);
    expect(bar.right).toBeCloseTo(fractionOf(NOW, WINDOW), 5);
  });

  it('draws an undated task as a dashed bar from now to the end', () => {
    const bar = timelineBarOf(entryOf(task('Spring garden')), at);
    expect(bar.tone).toBe('undated');
    expect(bar.label).toBe('No date');
    expect(bar.left).toBeCloseTo(fractionOf(NOW, WINDOW), 5);
    expect(bar.right).toBe(1);
  });

  it('marks a bar past the window and keeps it at the right edge', () => {
    const bar = timelineBarOf(
      entryOf(
        task('Book eye test', { start_local: '2026-11-20', all_day: true, due_date: '2026-11-22' }),
      ),
      at,
    );
    expect(bar.after).toBe(true);
    expect(bar.left).toBe(1);
    expect(bar.right).toBe(1);
    expect(bar.draggable).toBe(false);
  });

  it('does not let a repeating task be dragged', () => {
    const habit = task('Brush teeth', {
      rrule: 'FREQ=DAILY',
      start_local: '2026-11-01T07:30:00',
      time_zone: 'Europe/Berlin',
    });
    expect(timelineBarOf(entryOf(habit), at).draggable).toBe(false);
  });
});

describe('timeline rows', () => {
  it('keeps the filtered tasks in due order with their list', () => {
    const later = task('Later', { due_date: '2026-11-12', collection_id: WORK });
    const sooner = task('Sooner', { due_date: '2026-11-08' });
    const done = task('Done', { due_date: '2026-11-08', status: 'done' });
    const entries = taskEntriesOf({
      items: [later, sooner, done],
      occurrences: [],
      day: undefined,
    });
    const rows = timelineRowsOf({
      entries,
      filter: ALL_OPEN,
      collections: [list(HOME, 'Home'), list(WORK, 'Work')],
      ...at,
    });
    expect(rows.map((row) => row.entry.item.title)).toEqual(['Sooner', 'Later']);
    expect(rows.map((row) => row.collection?.name)).toEqual(['Home', 'Work']);
  });
});

describe('bar layout', () => {
  const base = {
    tone: 'list' as const,
    label: 'Mon',
    before: false,
    after: false,
    draggable: true,
  };

  it('keeps the label inside a wide bar', () => {
    expect(barLayoutOf({ ...base, left: 0.1, right: 0.5 }, 700)).toEqual({
      left: 70,
      right: 350,
      span: 280,
      side: 'inside',
    });
  });

  it('puts the label after a narrow bar, or before it at the right edge', () => {
    expect(barLayoutOf({ ...base, left: 0.1, right: 0.12 }, 700).side).toBe('after');
    expect(barLayoutOf({ ...base, left: 0.97, right: 0.99 }, 700).side).toBe('before');
  });

  it('keeps a stub visible at the window edge', () => {
    const layout = barLayoutOf({ ...base, left: 1, right: 1, after: true }, 700);
    expect(layout.span).toBe(6);
    expect(layout.left).toBe(694);
  });
});

describe('dragging a bar end', () => {
  it('drops on the day under the pointer and stays inside the window', () => {
    expect(dropDayOf(0, WINDOW)).toBe(TODAY);
    expect(dropDayOf(1 / 7, WINDOW)).toBe(TODAY);
    expect(dropDayOf(1 / 7 + 0.01, WINDOW)).toBe('2026-11-08');
    expect(dropDayOf(2, WINDOW)).toBe('2026-11-13');
  });

  it('moves a date due to the new day', () => {
    expect(dueChangeOf(task('A', { due_date: '2026-11-08' }), '2026-11-10')).toEqual({
      due_date: '2026-11-10',
    });
    expect(dueChangeOf(task('A', { due_date: '2026-11-10' }), '2026-11-10')).toBeNull();
  });

  it('keeps the time of day of a timed due date', () => {
    const item = task('B', { due_at: localAt('2026-11-08', 10) });
    expect(dueChangeOf(item, '2026-11-11')).toEqual({ due_at: localAt('2026-11-11', 10) });
    const both = task('C', { due_at: localAt('2026-11-08', 10), due_date: '2026-11-08' });
    expect(dueChangeOf(both, '2026-11-11')).toEqual({
      due_at: localAt('2026-11-11', 10),
      due_date: '2026-11-11',
    });
    expect(dueChangeOf(item, '2026-11-08')).toBeNull();
  });
});
