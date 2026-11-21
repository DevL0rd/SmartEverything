import { createHash, randomBytes } from 'node:crypto';
import {
  ApiError,
  type PlannerGuestEntry,
  type PlannerGuestRow,
  type PlannerItemRow,
} from '@smarteverything/domain';
import type { HostStore } from '../../store/host/host-store';

export type GuestListStore = Pick<
  HostStore,
  'plannerGuests' | 'profiles' | 'personAccess' | 'write'
>;

export interface GuestToken {
  readonly token: string;
  readonly hash: string;
}

export function hashGuestToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newGuestToken(): GuestToken {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashGuestToken(token) };
}

function requireEvent(item: PlannerItemRow): void {
  if (item.kind !== 'event') {
    throw new ApiError('invalid_request', 'Only an event has guests; a task is assigned.');
  }
  if (item.series_id !== null) {
    throw new ApiError('invalid_request', 'Guests belong to the whole series, not one occurrence.');
  }
}

function requirePerson(store: GuestListStore, profileId: string): void {
  const person = store.profiles.byId(profileId);
  const areas = store.personAccess.scopes(person.id)?.areas ?? [];
  if (!areas.includes('planner')) {
    throw new ApiError('invalid_request', `${person.name} has no access to the Planner.`);
  }
}

function keyOf(entry: PlannerGuestEntry): string {
  return entry.kind === 'person'
    ? `person:${entry.profile_id}`
    : `email:${entry.email.toLowerCase()}`;
}

function keyOfRow(row: PlannerGuestRow): string {
  return row.kind === 'person'
    ? `person:${row.profile_id ?? ''}`
    : `email:${(row.email ?? '').toLowerCase()}`;
}

function distinct(entries: readonly PlannerGuestEntry[]): PlannerGuestEntry[] {
  return [...new Map(entries.map((entry) => [keyOf(entry), entry])).values()];
}

function insertEntry(store: GuestListStore, item: PlannerItemRow, entry: PlannerGuestEntry): void {
  if (entry.kind === 'person') {
    requirePerson(store, entry.profile_id);
    store.plannerGuests.insert({
      item_id: item.id,
      kind: 'person',
      profile_id: entry.profile_id,
      email: null,
      name: null,
      delivery: 'not_sent',
      delivery_detail: null,
      token_hash: null,
    });
    return;
  }
  store.plannerGuests.insert({
    item_id: item.id,
    kind: 'email',
    profile_id: null,
    email: entry.email,
    name: entry.name,
    delivery: 'not_sent',
    delivery_detail: null,
    token_hash: newGuestToken().hash,
  });
}

export function setGuestList(
  store: GuestListStore,
  item: PlannerItemRow,
  entries: readonly PlannerGuestEntry[],
): PlannerGuestRow[] {
  requireEvent(item);
  return store.write(() => {
    const wanted = distinct(entries);
    const keys = new Set(wanted.map(keyOf));
    const current = store.plannerGuests.forItem(item.id);
    for (const row of current) {
      if (!keys.has(keyOfRow(row))) store.plannerGuests.remove(row.id);
    }
    const kept = new Map(current.map((row) => [keyOfRow(row), row]));
    for (const entry of wanted) {
      const existing = kept.get(keyOf(entry));
      if (existing === undefined) insertEntry(store, item, entry);
      else if (entry.kind === 'email' && entry.name !== existing.name) {
        store.plannerGuests.update(existing.id, { name: entry.name });
      }
    }
    return store.plannerGuests.forItem(item.id);
  });
}
