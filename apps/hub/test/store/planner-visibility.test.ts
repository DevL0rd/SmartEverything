import type { LiveChange, LiveTable } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { visible, type Hearing } from '../../src/server/live-visibility';
import { captureLogs } from '../support/logs';
import { addPerson, type TestPerson } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

const NOW = new Date('2026-11-07T08:00:00.000Z');

let test: TestStore;
let owner: TestPerson;
let ann: TestPerson;
let bob: TestPerson;
let changes: LiveChange[];

const TABLES: readonly LiveTable[] = [
  'planner_collections',
  'planner_items',
  'planner_occurrences',
  'planner_alarms',
  'planner_timers',
  'planner_stopwatches',
  'planner_collection_shares',
  'planner_guests',
  'planner_booking_pages',
  'google_accounts',
];

function hearing(person: TestPerson): Hearing {
  return { client: person.client, tables: new Set(TABLES) };
}

function seeded(profileId: string, sharedWith: string): void {
  const collection = test.store.plannerCollections.insert({
    profile_id: profileId,
    kind: 'calendar',
    name: 'Work',
    colour: 'work',
    icon: 'briefcase',
    position: 1,
    visible: true,
    default_reminders: [],
    audience: 'personal',
    source: 'local',
    google: null,
    feed: null,
  });
  const item = test.store.plannerItems.insert({
    profile_id: profileId,
    collection_id: collection.id,
    kind: 'task',
    parent_id: null,
    title: 'Pay rent',
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
  });
  test.store.plannerShares.save({
    collection_id: collection.id,
    profile_id: sharedWith,
    role: 'view',
  });
  test.store.plannerGuests.insert({
    item_id: item.id,
    kind: 'email',
    profile_id: null,
    email: 'guest@example.com',
    name: null,
    delivery: 'link_only',
    delivery_detail: null,
    token_hash: 'a'.repeat(64),
  });
  test.store.plannerBookingPages.insert(profileId, {
    collection_id: collection.id,
    title: 'Call',
    description: '',
    minutes: 30,
    availability: [{ day: 1, start: '09:00', end: '12:00' }],
    buffer_before: 0,
    buffer_after: 0,
    notice_minutes: 0,
    ahead_days: 14,
    location: null,
    enabled: true,
  });
  test.store.plannerOccurrences.save({
    item_id: item.id,
    occurrence_key: '2026-11-07',
    status: 'skipped',
    completed_at: null,
    completed_by: null,
    evidence: null,
    moved_start: null,
    moved_end: null,
  });
  test.store.plannerAlarms.insert({
    profile_id: profileId,
    label: null,
    time: '06:30',
    days: [1],
    once_on: null,
    skip_on: null,
    enabled: true,
    sound: { kind: 'tone', id: 'sunrise' },
    ramp_seconds: 0,
    vibrate: false,
    snooze_minutes: 9,
    snooze_limit: null,
    challenge: { kind: 'none' },
    sunrise: null,
    smart_minutes: null,
    wake_automation_id: null,
    wake_lead_minutes: null,
    targets: [],
    watch: [],
    source: 'planner',
  });
  test.store.plannerTimers.insert({
    profile_id: profileId,
    label: null,
    duration_ms: 60000,
    state: 'paused',
    ends_at: null,
    remaining_ms: 60000,
    targets: [],
  });
  test.store.plannerStopwatch.insert({
    profile_id: profileId,
    running: false,
    started_at: null,
    accumulated_ms: 0,
    laps: [],
  });
  test.store.googleAccounts.insert({
    profile_id: profileId,
    email: null,
    scopes: [],
    status: 'linking',
    problem: null,
    calendar_ids: [],
    list_ids: [],
    last_sync_at: null,
    last_error: null,
  });
}

beforeEach(async () => {
  captureLogs();
  test = await testStore(() => NOW);
  owner = addPerson(test, 'Owner', 'owner');
  ann = addPerson(test, 'Ann', 'member');
  bob = addPerson(test, 'Bob', 'member');
  changes = [];
  test.store.feed.subscribe((change) => changes.push(change));
  seeded(ann.profileId, owner.profileId);
});

afterEach(async () => {
  await test.close();
});

describe('planner and google rows on the live feed', () => {
  it('announces a change for every planner table and for google accounts', () => {
    expect([...new Set(changes.map((change) => change.table))].sort()).toEqual([...TABLES].sort());
  });

  it('shows a member their own rows', () => {
    expect(changes.every((change) => visible(hearing(ann), change, test.store))).toBe(true);
  });

  it('hides a person rows from another member', () => {
    expect(changes.some((change) => visible(hearing(bob), change, test.store))).toBe(false);
  });

  it('shows the owner every person rows', () => {
    expect(changes.every((change) => visible(hearing(owner), change, test.store))).toBe(true);
  });

  it('sends nothing for a table the connection did not ask for', () => {
    const only: Hearing = { client: ann.client, tables: new Set<LiveTable>(['planner_alarms']) };
    const shown = changes.filter((change) => visible(only, change, test.store));
    expect(shown.map((change) => change.table)).toEqual(['planner_alarms']);
  });
});

describe('shared calendars, guests and booking pages on the live feed', () => {
  function ofTable(table: LiveTable): LiveChange {
    const found = changes.find((change) => change.table === table);
    if (found === undefined) throw new Error(`no change for ${table}`);
    return found;
  }

  it('shows a share to the person it is shared with and to the owner of the calendar', () => {
    const share = ofTable('planner_collection_shares');
    expect(visible(hearing(ann), share, test.store)).toBe(true);
    expect(visible(hearing(owner), share, test.store)).toBe(true);
    expect(visible(hearing(bob), share, test.store)).toBe(false);
  });

  it('shows a share to a member who is only the sharee', () => {
    const collection = test.store.plannerCollections.list(ann.profileId)[0];
    if (collection === undefined) throw new Error('no collection');
    changes.length = 0;
    test.store.plannerShares.save({
      collection_id: collection.id,
      profile_id: bob.profileId,
      role: 'edit',
    });
    const share = ofTable('planner_collection_shares');
    expect(visible(hearing(bob), share, test.store)).toBe(true);
    expect(visible(hearing(ann), share, test.store)).toBe(true);
  });

  it('shows a guest row only where the event is visible', () => {
    const guest = ofTable('planner_guests');
    expect(visible(hearing(ann), guest, test.store)).toBe(true);
    expect(visible(hearing(owner), guest, test.store)).toBe(true);
    expect(visible(hearing(bob), guest, test.store)).toBe(false);
  });

  it('tells a member guest that the guest row was removed even after the event is gone', () => {
    const item = test.store.plannerItems.list(ann.profileId)[0];
    if (item === undefined) throw new Error('no item');
    test.store.plannerGuests.insert({
      item_id: item.id,
      kind: 'person',
      profile_id: bob.profileId,
      email: null,
      name: null,
      delivery: 'not_sent',
      delivery_detail: null,
      token_hash: null,
    });
    changes.length = 0;
    test.store.plannerItems.purge(item.id, ann.profileId);
    const removed = changes.filter(
      (change): change is Extract<LiveChange, { table: 'planner_guests' }> =>
        change.table === 'planner_guests' && change.operation === 'DELETE',
    );
    expect(removed).toHaveLength(2);
    const bobs = removed.filter((change) => change.oldRecord?.profile_id === bob.profileId);
    expect(bobs).toHaveLength(1);
    for (const change of bobs) expect(visible(hearing(bob), change, test.store)).toBe(true);
    for (const change of removed) {
      if (change.oldRecord?.profile_id !== bob.profileId) {
        expect(visible(hearing(bob), change, test.store)).toBe(false);
      }
    }
  });

  it('shows a booking page to its person and the owner only', () => {
    const page = ofTable('planner_booking_pages');
    expect(visible(hearing(ann), page, test.store)).toBe(true);
    expect(visible(hearing(owner), page, test.store)).toBe(true);
    expect(visible(hearing(bob), page, test.store)).toBe(false);
  });
});
