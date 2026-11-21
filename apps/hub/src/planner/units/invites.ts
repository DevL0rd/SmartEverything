import type { PlannerGuestRow, PlannerItemRow } from '@smarteverything/domain';
import { storeUnit } from '../../store/host/unit';
import type { HostStore } from '../../store/host/host-store';

export interface InviteMail {
  readonly organiser: string;
  readonly guests: PlannerGuestRow[];
  readonly overrides: PlannerItemRow[];
}

function cancelled(item: PlannerItemRow): boolean {
  return item.deleted_at !== null || item.status === 'cancelled';
}

function bumped(
  store: HostStore,
  { masterId }: { readonly masterId: string },
): PlannerItemRow | null {
  const master = store.plannerItems.findAny(masterId);
  if (master === undefined || cancelled(master)) return null;
  const guests = store.plannerGuests.forItem(masterId);
  if (!guests.some((guest) => guest.kind === 'email' && guest.email !== null)) return null;
  return store.plannerItems.update(master.id, master.profile_id, {
    ical_sequence: master.ical_sequence + 1,
  });
}

export const PLANNER_INVITE_READ_UNITS = {
  plannerInviteMail: storeUnit(
    (store, { item }: { readonly item: PlannerItemRow }): InviteMail => ({
      organiser: store.profiles.byId(item.profile_id).name,
      guests: store.plannerGuests.forItem(item.id),
      overrides: store.plannerItems.overrides(item.id, item.profile_id),
    }),
  ),
} as const;

export const PLANNER_INVITE_WRITE_UNITS = {
  plannerInviteBump: storeUnit(bumped),
} as const;
