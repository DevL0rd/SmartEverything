import type { PlannerGuestRow, PlannerItemRow } from '@smarteverything/domain';
import type { IcalGuest } from './model';

type Content = Pick<
  PlannerItemRow,
  | 'title'
  | 'notes'
  | 'location'
  | 'priority'
  | 'start_local'
  | 'end_local'
  | 'time_zone'
  | 'all_day'
  | 'due_date'
  | 'due_at'
  | 'rrule'
  | 'exdates'
  | 'status'
  | 'reminders'
  | 'original_start'
>;

function contentOf(row: Content): readonly unknown[] {
  return [
    row.title,
    row.notes,
    row.location,
    row.priority,
    row.start_local,
    row.end_local,
    row.time_zone,
    row.all_day,
    row.due_date,
    row.due_at,
    row.rrule,
    [...row.exdates],
    row.status,
    row.reminders.map((reminder) => reminder.minutes_before),
    row.original_start,
  ];
}

function guestOf(guest: IcalGuest | PlannerGuestRow): readonly unknown[] {
  return [guest.email?.toLowerCase() ?? null, guest.name, guest.response];
}

export function projectionOf(
  master: Content,
  overrides: readonly Content[],
  guests: readonly (IcalGuest | PlannerGuestRow)[],
): string {
  const parts = overrides.map((override) => JSON.stringify(contentOf(override))).sort();
  const people = guests.map((guest) => JSON.stringify(guestOf(guest))).sort();
  return JSON.stringify([contentOf(master), parts, people]);
}
