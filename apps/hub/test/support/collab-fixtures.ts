import type { PlannerCollectionRow, PlannerItemRow } from '@smarteverything/domain';
import { instantsOf } from '../../src/planner/instants';
import type { PlannerItemInput } from '../../src/store/repositories/planner-items';
import type { SeededStore } from './store';

export function calendarOf(
  store: SeededStore,
  profileId: string,
  overrides: Partial<Parameters<SeededStore['plannerCollections']['insert']>[0]> = {},
): PlannerCollectionRow {
  return store.plannerCollections.insert({
    profile_id: profileId,
    kind: 'calendar',
    name: 'Work',
    colour: 'work',
    icon: 'briefcase',
    position: 0,
    visible: true,
    default_reminders: [],
    audience: 'personal',
    source: 'local',
    google: null,
    feed: null,
    ...overrides,
  });
}

export function eventOf(
  store: SeededStore,
  profileId: string,
  collectionId: string,
  overrides: Partial<PlannerItemInput> = {},
): PlannerItemRow {
  const timing = {
    start_local: '2026-11-16T19:00',
    end_local: '2026-11-16T20:00',
    time_zone: 'UTC',
    all_day: false,
    rrule: null,
    ...overrides,
  };
  return store.plannerItems.insert({
    profile_id: profileId,
    collection_id: collectionId,
    kind: 'event',
    parent_id: null,
    title: 'Dinner',
    notes: '',
    location: null,
    priority: null,
    tags: [],
    estimate_minutes: null,
    due_date: null,
    due_at: null,
    exdates: [],
    series_id: null,
    original_start: null,
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
    ...instantsOf(timing),
    ...timing,
    ...overrides,
  });
}
