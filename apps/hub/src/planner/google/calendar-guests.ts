import type { JsonValue, PlannerGuestRow, PlannerItemRow } from '@smarteverything/domain';
import type { Attendee, GoogleEvent } from '@smarteverything/google';
import { z } from 'zod';
import { newGuestToken } from '../guests/guest-list';
import type { Store } from '../../store/store';

export const ATTENDEE_FIELD = 'attendees';

const FROM_GOOGLE = {
  needsAction: 'needs_action',
  accepted: 'yes',
  declined: 'no',
  tentative: 'maybe',
} as const;

export type GuestStore = Pick<Store, 'plannerGuests'>;

function listed(emails: readonly string[]): JsonValue | undefined {
  if (emails.length === 0) return undefined;
  return [...new Set(emails.map((email) => email.toLowerCase()))]
    .sort()
    .map((email) => ({ email }));
}

export function guestFields(guests: readonly PlannerGuestRow[]): Record<string, JsonValue> {
  const value = listed(guests.flatMap((guest) => (guest.email === null ? [] : [guest.email])));
  return value === undefined ? {} : { [ATTENDEE_FIELD]: value };
}

export function attendeesOf(event: GoogleEvent): readonly Attendee[] {
  return (event.attendees ?? []).filter(
    (attendee) =>
      attendee.organizer !== true && attendee.self !== true && attendee.resource !== true,
  );
}

export function eventGuestFields(event: GoogleEvent): Record<string, JsonValue> {
  const value = listed(attendeesOf(event).map((attendee) => attendee.email));
  return value === undefined ? {} : { [ATTENDEE_FIELD]: value };
}

export function emailsOf(fields: Readonly<Record<string, JsonValue>>): readonly string[] {
  const parsed = z.array(z.object({ email: z.string() })).safeParse(fields[ATTENDEE_FIELD] ?? []);
  return parsed.success ? parsed.data.map((entry) => entry.email.toLowerCase()) : [];
}

function answered(
  guest: PlannerGuestRow,
  response: PlannerGuestRow['response'],
  at: string,
): Pick<PlannerGuestRow, 'response' | 'note' | 'responded_at'> {
  return {
    response,
    note: response === 'needs_action' ? null : guest.note,
    responded_at: response === 'needs_action' ? null : (guest.responded_at ?? at),
  };
}

function knownGuest(
  store: GuestStore,
  guest: PlannerGuestRow,
  attendee: Attendee,
  at: string,
): void {
  const response = FROM_GOOGLE[attendee.responseStatus ?? 'needsAction'];
  if (guest.response === response && guest.delivery === 'google') return;
  store.plannerGuests.update(guest.id, {
    ...answered(guest, response, at),
    delivery: 'google',
    delivery_detail: null,
  });
}

function newGuest(store: GuestStore, itemId: string, attendee: Attendee, at: string): void {
  const created = store.plannerGuests.insert({
    item_id: itemId,
    kind: 'email',
    profile_id: null,
    email: attendee.email,
    name: attendee.displayName?.trim() === '' ? null : (attendee.displayName ?? null),
    delivery: 'google',
    delivery_detail: null,
    token_hash: newGuestToken().hash,
  });
  knownGuest(store, created, attendee, at);
}

export interface AttendeeSync {
  readonly itemId: string;
  readonly attendees: readonly Attendee[];
  readonly kept: readonly string[];
  readonly at: string;
}

export function applyAttendees(store: GuestStore, sync: AttendeeSync): void {
  const { itemId, attendees, kept, at } = sync;
  const current = new Map(
    store.plannerGuests
      .forItem(itemId)
      .flatMap((guest) => (guest.email === null ? [] : [[guest.email.toLowerCase(), guest]])),
  );
  const wanted = new Set(kept.map((email) => email.toLowerCase()));
  for (const attendee of attendees) {
    const guest = current.get(attendee.email.toLowerCase());
    if (guest === undefined) newGuest(store, itemId, attendee, at);
    else knownGuest(store, guest, attendee, at);
    wanted.add(attendee.email.toLowerCase());
  }
  for (const [email, guest] of current) {
    if (!wanted.has(email)) store.plannerGuests.remove(guest.id);
  }
}

export interface AttendeePull {
  readonly item: Pick<PlannerItemRow, 'id' | 'series_id'>;
  readonly event: GoogleEvent;
  readonly merged: Readonly<Record<string, JsonValue>>;
  readonly at: string;
}

export function pullAttendees(store: GuestStore, pull: AttendeePull): void {
  if (pull.item.series_id !== null) return;
  applyAttendees(store, {
    itemId: pull.item.id,
    attendees: attendeesOf(pull.event),
    kept: emailsOf(pull.merged),
    at: pull.at,
  });
}

export function guestsOfItem(
  store: GuestStore,
  item: Pick<PlannerItemRow, 'id' | 'series_id'>,
): PlannerGuestRow[] {
  return store.plannerGuests.forItem(item.series_id ?? item.id);
}
