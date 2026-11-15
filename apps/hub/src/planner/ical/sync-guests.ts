import type { PlannerGuestRow } from '@smarteverything/domain';
import { hashPublicToken, newPublicToken } from '../../store/repositories/public-token';
import type { Store } from '../../store/store';
import type { IcalGuest } from './model';

type GuestStore = Pick<Store, 'plannerGuests'>;

function emailOf(row: PlannerGuestRow): string | null {
  return row.email === null ? null : row.email.toLowerCase();
}

function answer(store: GuestStore, row: PlannerGuestRow, guest: IcalGuest, now: Date): void {
  if (row.response === guest.response && row.name === guest.name) return;
  store.plannerGuests.update(row.id, {
    name: guest.name,
    response: guest.response,
    responded_at: guest.response === 'needs_action' ? null : now.toISOString(),
    ...(guest.response === 'needs_action' ? { note: null } : {}),
  });
}

export function syncGuests(
  store: GuestStore,
  itemId: string,
  guests: readonly IcalGuest[],
  now: Date,
): void {
  const rows = store.plannerGuests.forItem(itemId);
  const incoming = new Map(guests.map((guest) => [guest.email, guest]));
  for (const row of rows) {
    const email = emailOf(row);
    const guest = email === null ? undefined : incoming.get(email);
    if (email === null) continue;
    if (guest === undefined) store.plannerGuests.remove(row.id);
    else answer(store, row, guest, now);
  }
  const present = new Set(rows.map(emailOf));
  for (const guest of guests) {
    if (present.has(guest.email)) continue;
    const row = store.plannerGuests.insert({
      item_id: itemId,
      kind: 'email',
      profile_id: null,
      email: guest.email,
      name: guest.name,
      delivery: 'not_sent',
      delivery_detail: null,
      token_hash: hashPublicToken(newPublicToken()),
    });
    answer(store, row, guest, now);
  }
}
