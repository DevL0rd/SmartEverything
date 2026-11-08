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
  'google_accounts',
];

function hearing(person: TestPerson): Hearing {
  return { client: person.client, tables: new Set(TABLES) };
}

function seeded(profileId: string): void {
  const collection = test.store.plannerCollections.insert({
    profile_id: profileId,
    kind: 'calendar',
    name: 'Work',
    colour: 'work',
    icon: 'briefcase',
    position: 1,
    visible: true,
    default_reminders: [],
    source: 'local',
    google: null,
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
    created_by: 'person',
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
    sound: 'sunrise',
    ramp_seconds: 0,
    vibrate: false,
    snooze_minutes: 9,
    smart_minutes: null,
    wake_scene_id: null,
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
  seeded(ann.profileId);
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
