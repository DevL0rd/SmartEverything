import {
  PLANNER_COLLECTION_ROW,
  PLANNER_ITEM_ROW,
  type PlannerCollectionRow,
  type PlannerItemRow,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  boardColumnsOf,
  boardMovesOf,
  boardStatusOf,
  matrixOf,
  quadrantOf,
  type BoardColumnModel,
  type BoardGrouping,
} from './matrix-model';
import { ALL_OPEN, taskEntriesOf, type TaskEntry, type TaskFilter } from './task-grouping';

const PROFILE = 'a1b2c3d4-0000-4000-8000-000000000001';
const HOME = 'a1b2c3d4-0000-4000-8000-0000000000c1';
const WORK = 'a1b2c3d4-0000-4000-8000-0000000000c2';
const SHOPPING = 'a1b2c3d4-0000-4000-8000-0000000000c3';
const STAMP = '2026-11-01T08:00:00.000Z';
const TODAY = '2026-11-07';

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

const LISTS = [list(WORK, 'Work', 1), list(HOME, 'Home', 0), list(SHOPPING, 'Shopping', 2)];

function entriesOf(items: readonly PlannerItemRow[]): readonly TaskEntry[] {
  return taskEntriesOf({ items, occurrences: [], day: undefined });
}

function titlesOf(entries: readonly TaskEntry[]): readonly string[] {
  return entries.map((entry) => entry.item.title);
}

function board(
  items: readonly PlannerItemRow[],
  grouping: BoardGrouping,
  filter: TaskFilter = ALL_OPEN,
): readonly BoardColumnModel[] {
  return boardColumnsOf({
    entries: entriesOf(items),
    filter,
    collections: LISTS,
    today: TODAY,
    grouping,
  });
}

describe('the task matrix', () => {
  const dentist = task('Call the dentist', { priority: 1, due_date: '2026-11-06' });
  const water = task('Drink water', { priority: 2, due_date: TODAY });
  const draft = task('Review the Q4 draft', { priority: 2, due_date: '2026-11-09' });
  const eyes = task('Book eye test', { priority: 3 });
  const recycling = task('Take out the recycling', { due_date: TODAY });
  const late = task('Return the parcel', { due_date: '2026-11-01' });
  const invoice = task('Send invoice', { due_date: '2026-11-10' });
  const garden = task('Plan the spring garden');
  const done = task('Buy oat milk', { priority: 1, due_date: TODAY, status: 'done' });
  const all = [dentist, water, draft, eyes, recycling, late, invoice, garden, done];

  it('puts urgent and important tasks in Do now and the rest by the same two questions', () => {
    const quadrants = matrixOf({ entries: entriesOf(all), filter: ALL_OPEN, today: TODAY });
    expect(quadrants.map((quadrant) => [quadrant.title, titlesOf(quadrant.entries)])).toEqual([
      ['Do now', ['Call the dentist', 'Drink water']],
      ['Plan', ['Review the Q4 draft', 'Book eye test']],
      ['Do fast', ['Return the parcel', 'Take out the recycling']],
      ['Later', ['Send invoice', 'Plan the spring garden']],
    ]);
  });

  it('counts a task as urgent when it is due today or overdue, never by priority alone', () => {
    const [entry] = entriesOf([task('Pay rent', { priority: 1, due_date: '2026-11-08' })]);
    expect(entry === undefined ? null : quadrantOf(entry, TODAY)).toBe('plan');
    const [timed] = entriesOf([task('Call back', { due_at: '2026-11-07T12:00:00.000Z' })]);
    expect(timed === undefined ? null : quadrantOf(timed, TODAY)).toBe('fast');
  });

  it('leaves finished tasks out and follows the chosen list', () => {
    const quadrants = matrixOf({
      entries: entriesOf([...all, task('Fix the deploy', { collection_id: WORK, priority: 1 })]),
      filter: { kind: 'list', id: WORK },
      today: TODAY,
    });
    expect(quadrants.map((quadrant) => titlesOf(quadrant.entries))).toEqual([
      [],
      ['Fix the deploy'],
      [],
      [],
    ]);
  });
});

describe('the task board', () => {
  it('shows one column per list in list order, keeps empty lists and orders cards by hand', () => {
    const second = task('Descale the kettle', { position: 2 });
    const first = task('Water the plants', { position: 1 });
    const work = task('Send invoice', { collection_id: WORK });
    const columns = board([second, work, first], 'list');
    expect(columns.map((column) => [column.title, titlesOf(column.entries)])).toEqual([
      ['Home', ['Water the plants', 'Descale the kettle']],
      ['Work', ['Send invoice']],
      ['Shopping', []],
    ]);
  });

  it('drops empty lists under a smart list and shows only the chosen list', () => {
    const today = task('Recycling', { due_date: TODAY });
    const later = task('Invoice', { collection_id: WORK, due_date: '2026-11-12' });
    const smart = board([today, later], 'list', { kind: 'smart', list: 'today' });
    expect(smart.map((column) => column.title)).toEqual(['Home']);
    const chosen = board([today, later], 'list', { kind: 'list', id: SHOPPING });
    expect(chosen.map((column) => [column.title, column.entries.length])).toEqual([
      ['Shopping', 0],
    ]);
  });

  it('sorts tasks into status columns and adds Done only when finished tasks are shown', () => {
    const items = [
      task('Late', { due_date: '2026-11-05' }),
      task('Now', { due_date: TODAY }),
      task('Soon', { due_date: '2026-11-08' }),
      task('Whenever'),
      task('Finished', { status: 'done', due_date: TODAY }),
    ];
    const open = board(items, 'status');
    expect(open.map((column) => [column.title, titlesOf(column.entries)])).toEqual([
      ['Overdue', ['Late']],
      ['Today', ['Now']],
      ['Upcoming', ['Soon']],
      ['No date', ['Whenever']],
    ]);
    const finished = board(items, 'status', { kind: 'smart', list: 'completed' });
    expect(finished.map((column) => [column.title, titlesOf(column.entries)])).toEqual([
      ['Overdue', []],
      ['Today', []],
      ['Upcoming', []],
      ['No date', []],
      ['Done', ['Finished']],
    ]);
  });

  it('names the status of a single entry', () => {
    const [entry] = entriesOf([task('Soon', { due_date: '2026-11-20' })]);
    expect(entry === undefined ? null : boardStatusOf(entry, TODAY)).toBe('upcoming');
  });
});

describe('reordering a board column', () => {
  const a = task('A', { position: 1 });
  const b = task('B', { position: 2 });
  const c = task('C', { position: 3 });
  const column = entriesOf([a, b, c]);

  it('writes one position between the new neighbours of the moved card', () => {
    expect(boardMovesOf(column, [a.id, c.id, b.id])).toEqual([{ item: c, position: 1.5 }]);
    expect(boardMovesOf(column, [c.id, a.id, b.id])).toEqual([{ item: c, position: 0 }]);
    expect(boardMovesOf(column, [b.id, c.id, a.id])).toEqual([{ item: a, position: 4 }]);
  });

  it('writes nothing when the order did not change', () => {
    expect(boardMovesOf(column, [a.id, b.id, c.id])).toEqual([]);
  });

  it('renumbers the column when the neighbours share a position', () => {
    const x = task('X', { position: 0 });
    const y = task('Y', { position: 0 });
    const z = task('Z', { position: 5 });
    const moves = boardMovesOf(entriesOf([x, y, z]), [x.id, z.id, y.id]);
    expect(moves).toEqual([
      { item: z, position: 1 },
      { item: y, position: 2 },
    ]);
  });
});
