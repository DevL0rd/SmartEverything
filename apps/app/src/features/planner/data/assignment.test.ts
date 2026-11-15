import {
  PLANNER_COLLECTION_ROW,
  PLANNER_COLLECTION_SHARE_ROW,
  PLANNER_GUEST_ROW,
  PLANNER_ITEM_ROW,
  SESSION,
  type PlannerCollectionRow,
  type PlannerCollectionShareRow,
  type PlannerGuestRow,
  type PlannerItemRow,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { applyChange } from '../../../store/live-reducers';
import { emptyState, makeTable, type StoreState, type Table } from '../../../store/state';
import {
  itemCollectionsSelector,
  itemRoleIn,
  seenBy,
  writableCollectionsSelector,
} from './assignment';

const ALEX = 'a1b2c3d4-0000-4000-8000-0000000000a1';
const SAM = 'a1b2c3d4-0000-4000-8000-0000000000a2';
const ROBIN = 'a1b2c3d4-0000-4000-8000-0000000000a3';
const STAMP = '2026-11-01T08:00:00.000Z';

let next = 0;

function id(): string {
  next += 1;
  return `a1b2c3d4-0000-4000-8000-${String(next).padStart(12, '0')}`;
}

function collection(
  owner: string,
  extra: Partial<PlannerCollectionRow> = {},
): PlannerCollectionRow {
  return PLANNER_COLLECTION_ROW.parse({
    id: id(),
    profile_id: owner,
    kind: 'calendar',
    name: 'Calendar',
    colour: 'personal',
    icon: 'calendar',
    position: 0,
    visible: true,
    default_reminders: [],
    audience: 'personal',
    source: 'local',
    google: null,
    feed: null,
    created_at: STAMP,
    updated_at: STAMP,
    ...extra,
  });
}

function share(
  row: PlannerCollectionRow,
  profile: string,
  role: 'view' | 'edit',
): PlannerCollectionShareRow {
  return PLANNER_COLLECTION_SHARE_ROW.parse({
    collection_id: row.id,
    profile_id: profile,
    role,
    colour: null,
    visible: true,
    created_at: STAMP,
  });
}

function event(row: PlannerCollectionRow, extra: Partial<PlannerItemRow> = {}): PlannerItemRow {
  return PLANNER_ITEM_ROW.parse({
    id: id(),
    profile_id: row.profile_id,
    collection_id: row.id,
    kind: 'event',
    parent_id: null,
    title: 'Movie night',
    notes: '',
    location: null,
    priority: null,
    tags: [],
    estimate_minutes: null,
    start_local: '2026-11-07T19:00:00',
    end_local: '2026-11-07T21:00:00',
    time_zone: 'Europe/London',
    all_day: false,
    due_date: null,
    due_at: null,
    rrule: null,
    exdates: [],
    series_id: null,
    original_start: null,
    start: '2026-11-07T19:00:00.000Z',
    end: '2026-11-07T21:00:00.000Z',
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

function guest(item: PlannerItemRow, profile: string): PlannerGuestRow {
  return PLANNER_GUEST_ROW.parse({
    id: id(),
    item_id: item.id,
    kind: 'person',
    profile_id: profile,
    email: null,
    name: null,
    response: 'needs_action',
    note: null,
    delivery: 'not_sent',
    delivery_detail: null,
    invited_at: STAMP,
    responded_at: null,
  });
}

function tableOf<R>(rows: readonly R[], key: (row: R) => string): Table<R> {
  return makeTable(Object.fromEntries(rows.map((row) => [key(row), row])), rows.map(key), 1);
}

interface Rows {
  readonly collections?: readonly PlannerCollectionRow[];
  readonly shares?: readonly PlannerCollectionShareRow[];
  readonly items?: readonly PlannerItemRow[];
  readonly guests?: readonly PlannerGuestRow[];
}

function stateOf(rows: Rows): StoreState {
  const state = emptyState();
  return {
    ...state,
    tables: {
      ...state.tables,
      planner_collections: tableOf(rows.collections ?? [], (row) => row.id),
      planner_collection_shares: tableOf(
        rows.shares ?? [],
        (row) => `${row.collection_id}\n${row.profile_id}`,
      ),
      planner_items: tableOf(rows.items ?? [], (row) => row.id),
      planner_guests: tableOf(rows.guests ?? [], (row) => row.id),
    },
  };
}

describe('itemRoleIn', () => {
  it('lets every household member edit a Family item, whoever made it', () => {
    const family = collection(ALEX, { audience: 'household', name: 'Family' });
    const movie = event(family);
    const fromSam = event(family, { profile_id: SAM });
    const state = stateOf({ collections: [family], items: [movie, fromSam] });
    expect(itemRoleIn(state, movie, SAM)).toBe('edit');
    expect(seenBy(state, movie, SAM)).toBe(true);
    expect(itemRoleIn(state, fromSam, ALEX)).toBe('owner');
  });

  it('gives a view share read-only access and an edit share full access', () => {
    const work = collection(ALEX);
    const meeting = event(work);
    const state = stateOf({
      collections: [work],
      shares: [share(work, SAM, 'view'), share(work, ROBIN, 'edit')],
      items: [meeting],
    });
    expect(itemRoleIn(state, meeting, SAM)).toBe('view');
    expect(itemRoleIn(state, meeting, ROBIN)).toBe('edit');
  });

  it('lets the collection role win over a guest invitation', () => {
    const work = collection(ALEX);
    const brunch = event(work);
    const state = stateOf({
      collections: [work],
      shares: [share(work, SAM, 'edit')],
      items: [brunch],
      guests: [guest(brunch, SAM), guest(brunch, ROBIN)],
    });
    expect(itemRoleIn(state, brunch, SAM)).toBe('edit');
    expect(itemRoleIn(state, brunch, ROBIN)).toBe('guest');
  });

  it('reads a feed calendar as view only and hides items from strangers', () => {
    const birthdays = collection(ALEX, { source: 'feed', feed: { kind: 'birthdays' } });
    const holidays = collection(ALEX, {
      source: 'feed',
      feed: { kind: 'holidays', country: 'DE', state: null },
    });
    const work = collection(ALEX);
    const meeting = event(work);
    const state = stateOf({ collections: [birthdays, holidays, work], items: [meeting] });
    expect(itemRoleIn(state, event(birthdays), ALEX)).toBe('owner');
    expect(itemRoleIn(state, event(birthdays, { created_by: 'feed' }), ALEX)).toBe('view');
    expect(itemRoleIn(state, event(holidays), ALEX)).toBe('view');
    expect(itemRoleIn(state, event(work, { created_by: 'feed' }), ALEX)).toBe('view');
    expect(itemRoleIn(state, meeting, SAM)).toBeNull();
    expect(seenBy(state, meeting, SAM)).toBe(false);
    expect(seenBy(state, { ...meeting, deleted_at: STAMP }, ALEX)).toBe(false);
  });

  it('keeps assignees on tasks and their steps', () => {
    const list = collection(ALEX, { kind: 'list', name: 'Chores' });
    const task = event(list, { kind: 'task', assignee_id: SAM });
    const step = event(list, { kind: 'task', parent_id: task.id });
    const state = stateOf({ collections: [list], items: [task, step] });
    expect(itemRoleIn(state, task, SAM)).toBe('assignee');
    expect(itemRoleIn(state, step, SAM)).toBe('assignee');
  });
});

describe('itemCollectionsSelector', () => {
  it('offers only calendars the viewer may write to and keeps the current one', () => {
    const family = collection(ALEX, { audience: 'household', name: 'Family' });
    const viewed = collection(ALEX, { name: 'Viewed' });
    const edited = collection(ALEX, { name: 'Edited' });
    const own = collection(SAM, { name: 'Mine' });
    const state = stateOf({
      collections: [family, viewed, edited, own],
      shares: [share(viewed, SAM, 'view'), share(edited, SAM, 'edit')],
    });
    const result = itemCollectionsSelector(SAM, viewed.id)(state);
    expect(result.writable.map((row) => row.name)).toEqual(['Family', 'Edited', 'Mine']);
    expect(result.current?.name).toBe('Viewed');
  });

  it('offers the birthdays calendar for hand-added birthdays but no other feed', () => {
    const birthdays = collection(SAM, {
      name: 'Birthdays',
      source: 'feed',
      feed: { kind: 'birthdays' },
    });
    const holidays = collection(SAM, {
      name: 'Holidays',
      source: 'feed',
      feed: { kind: 'holidays', country: 'DE', state: null },
    });
    const state = stateOf({ collections: [birthdays, holidays] });
    expect(writableCollectionsSelector(SAM)(state).map((row) => row.name)).toEqual(['Birthdays']);
  });

  it('has no current calendar for an item seen only through an invitation', () => {
    const work = collection(ALEX, { name: 'Work' });
    const brunch = event(work);
    const state = stateOf({ collections: [work], items: [brunch], guests: [guest(brunch, SAM)] });
    expect(itemRoleIn(state, brunch, SAM)).toBe('guest');
    expect(itemCollectionsSelector(SAM, work.id)(state).current).toBeNull();
    expect(
      itemCollectionsSelector(SAM, 'a1b2c3d4-0000-4000-8000-00000000ffff')(state).current,
    ).toBeNull();
  });
});

describe('leaving an invitation', () => {
  const session = SESSION.parse({
    client: {
      id: 'a1b2c3d4-0000-4000-8000-0000000000c1',
      name: 'Phone',
      platform: 'android',
      role: 'member',
      built_in: false,
      profile_id: SAM,
      created_at: STAMP,
      last_seen_at: null,
    },
    hub: { version: '1.0.0', startedAt: STAMP, cameras: 'running' },
  });

  function removed(state: StoreState, row: PlannerGuestRow): StoreState {
    return applyChange(
      { ...state, session },
      {
        type: 'change',
        table: 'planner_guests',
        operation: 'DELETE',
        record: null,
        oldRecord: row,
      },
    );
  }

  it('drops the event and its instances once the viewer is no longer a guest', () => {
    const work = collection(ALEX);
    const brunch = event(work, { rrule: 'FREQ=WEEKLY' });
    const moved = event(work, { series_id: brunch.id, original_start: brunch.start });
    const invite = guest(brunch, SAM);
    const state = removed(
      stateOf({ collections: [work], items: [brunch, moved], guests: [invite] }),
      invite,
    );
    expect(state.tables.planner_items.ids).toEqual([]);
    expect(state.tables.planner_guests.ids).toEqual([]);
  });

  it('keeps the event when the viewer still sees it through a share', () => {
    const work = collection(ALEX);
    const brunch = event(work);
    const invite = guest(brunch, SAM);
    const state = removed(
      stateOf({
        collections: [work],
        shares: [share(work, SAM, 'view')],
        items: [brunch],
        guests: [invite],
      }),
      invite,
    );
    expect(state.tables.planner_items.ids).toEqual([brunch.id]);
  });

  it('keeps the event when someone else leaves it', () => {
    const work = collection(ALEX);
    const brunch = event(work);
    const mine = guest(brunch, SAM);
    const theirs = guest(brunch, ROBIN);
    const state = removed(
      stateOf({ collections: [work], items: [brunch], guests: [mine, theirs] }),
      theirs,
    );
    expect(state.tables.planner_items.ids).toEqual([brunch.id]);
  });
});
