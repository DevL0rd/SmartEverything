import {
  PLANNER_COLLECTION_ROW,
  PLANNER_ITEM_ROW,
  type PlannerCollectionRow,
  type PlannerItemRow,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { shiftDay } from '../../../format/time';
import { assignedRowsOf } from '../data/assignment';
import {
  ALL_OPEN,
  assignedSideOf,
  smartCountOf,
  taskEntriesOf,
  type TaskFilter,
} from './task-grouping';
import { taskGroupsOf, taskListRowsOf } from './task-rows';

const PROFILE = 'a1b2c3d4-0000-4000-8000-000000000001';
const HOME = 'a1b2c3d4-0000-4000-8000-0000000000c1';
const WORK = 'a1b2c3d4-0000-4000-8000-0000000000c2';
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
    assignee_id: null,
    ical_uid: null,
    ical_sequence: 0,
    booking_page_id: null,
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
    audience: 'personal',
    source: 'local',
    google: null,
    feed: null,
    created_at: STAMP,
    updated_at: STAMP,
  });
}

function smart(listName: Extract<TaskFilter, { kind: 'smart' }>['list']): TaskFilter {
  return { kind: 'smart', list: listName };
}

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

describe('assigned tasks', () => {
  const SAM = 'a1b2c3d4-0000-4000-8000-0000000000a2';
  const collections = [list(HOME, 'Home', 0)];
  const given = task('Rake the leaves', { assignee_id: SAM });
  const mine = task('Water the plants');
  const received = task('Order sheet music', {
    profile_id: SAM,
    collection_id: 'a1b2c3d4-0000-4000-8000-0000000000c9',
    assignee_id: PROFILE,
  });
  const self = task('Note to self', { assignee_id: PROFILE });

  it('knows which side of an assignment the viewer is on', () => {
    expect(assignedSideOf(given, PROFILE)).toBe('by_me');
    expect(assignedSideOf(received, PROFILE)).toBe('to_me');
    expect(assignedSideOf(self, PROFILE)).toBeNull();
    expect(assignedSideOf(mine, PROFILE)).toBeNull();
    expect(assignedSideOf(given, null)).toBeNull();
  });

  it('splits the Assigned list into to me first, then by me', () => {
    const entries = taskEntriesOf({
      items: [given, mine, received, self],
      occurrences: [],
      day: undefined,
      me: PROFILE,
    });
    expect(smartCountOf(entries, 'assigned', TODAY)).toBe(2);
    const groups = taskGroupsOf({ entries, filter: smart('assigned'), collections, today: TODAY });
    expect(groups.map((group) => [group.title, group.entries.map((e) => e.item.title)])).toEqual([
      ['Assigned to me', ['Order sheet music']],
      ['Assigned by me', ['Rake the leaves']],
    ]);
  });

  it('brings in tasks others assigned to the viewer with their steps only', () => {
    const step = task('Pick the pieces', { profile_id: SAM, parent_id: received.id });
    const stranger = task('Sam’s own thing', { profile_id: SAM });
    const rows = assignedRowsOf([given, mine, received, step, stranger], [], PROFILE);
    expect(rows.items.map((item) => item.title)).toEqual(['Order sheet music', 'Pick the pieces']);
    expect(assignedRowsOf([given, mine], [], PROFILE).items).toEqual([]);
  });

  it('puts a task from a list the viewer cannot see under Assigned to me', () => {
    const entries = taskEntriesOf({
      items: [mine, received],
      occurrences: [],
      day: undefined,
      me: PROFILE,
    });
    const groups = taskGroupsOf({ entries, filter: ALL_OPEN, collections, today: TODAY });
    expect(groups.map((group) => group.title)).toEqual(['Home', 'Assigned to me']);
  });
});

describe('steps in the task list', () => {
  const collections = [list(HOME, 'Home', 0)];
  const parent = task('File the tax return');
  const above = task('Book the dentist', { due_date: TODAY });
  const second = task('Submit', { parent_id: parent.id, position: 2 });
  const first = task('Gather receipts', { parent_id: parent.id, position: 1, status: 'done' });
  const entries = taskEntriesOf({
    items: [parent, above, second, first],
    occurrences: [],
    day: undefined,
  });

  it('keeps the steps on their task in step order with their counts', () => {
    const entry = entries.find((one) => one.item.id === parent.id);
    expect(entry?.children.map((step) => [step.item.title, step.done])).toEqual([
      ['Gather receipts', true],
      ['Submit', false],
    ]);
    expect(entry?.steps).toEqual({ done: 1, total: 2 });
  });

  it('shows the steps under an expanded task and gives each task the one above it', () => {
    const groups = taskGroupsOf({ entries, filter: ALL_OPEN, collections, today: TODAY });
    const closed = taskListRowsOf(groups);
    expect(closed.map((row) => row.kind)).toEqual(['head', 'task', 'task']);
    const open = taskListRowsOf(groups, new Set([parent.id]));
    expect(open.map((row) => (row.kind === 'head' ? 'head' : `${row.kind}:${row.edge}`))).toEqual([
      'head',
      'task:first',
      'task:middle',
      'step:middle',
      'step:last',
    ]);
    const tasks = open.flatMap((row) => (row.kind === 'task' ? [row] : []));
    expect(tasks.map((row) => row.above?.title ?? null)).toEqual([null, 'Book the dentist']);
    expect(tasks[1]?.expanded).toBe(true);
  });
});
