import type { PlannerItemInput } from '../../store/repositories/planner-items';
import { instantsOf } from '../instants';

export interface AllDayEvent {
  readonly profileId: string;
  readonly collectionId: string;
  readonly position: number;
  readonly uid: string;
  readonly title: string;
  readonly date: string;
  readonly rrule: string | null;
}

export function allDayEvent(event: AllDayEvent): PlannerItemInput {
  const timing = {
    start_local: event.date,
    end_local: null,
    time_zone: null,
    all_day: true,
    rrule: event.rrule,
  };
  return {
    profile_id: event.profileId,
    collection_id: event.collectionId,
    kind: 'event',
    parent_id: null,
    title: event.title,
    notes: '',
    location: null,
    priority: null,
    tags: [],
    estimate_minutes: null,
    ...timing,
    due_date: null,
    due_at: null,
    exdates: [],
    series_id: null,
    original_start: null,
    ...instantsOf(timing),
    status: 'open',
    position: event.position,
    completion: { kind: 'manual' },
    attachments: [],
    reminders: [],
    google: null,
    assignee_id: null,
    ical_uid: event.uid,
    ical_sequence: 0,
    booking_page_id: null,
    created_by: 'feed',
  };
}
