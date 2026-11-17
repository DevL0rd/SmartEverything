import type { PlannerGuestEntry, PlannerGuestRow, PlannerItemRow } from '@smarteverything/domain';
import { notify } from '../../../components/toast-store';
import { guestWrites } from './guests';
import type { PlannerPerson } from './person';
import { keyedQueues, useQueuedSaves, type QueuedSaves } from './save-queue';
import { plannerWrites, type ItemChange } from './writes';

type ItemChanges = ItemChange['changes'];

export function withoutSent(current: ItemChanges, sent: ItemChanges): ItemChanges {
  const sentJson = new Map(
    Object.entries(sent).map(([key, value]) => [key, JSON.stringify(value)]),
  );
  return Object.fromEntries(
    Object.entries(current).filter(([key, value]) => sentJson.get(key) !== JSON.stringify(value)),
  );
}

export class ItemGoneError extends Error {
  override readonly name = 'ItemGoneError';

  constructor(readonly itemId: string) {
    super('That item was deleted before the change was saved.');
  }
}

export const itemQueueOf = keyedQueues<ItemChanges>((store, person, itemId) => {
  const writes = plannerWrites(store, person);
  return {
    event: 'planner_item.save',
    send: (changes): Promise<PlannerItemRow> => {
      const row = store.get().tables.planner_items.byId[itemId];
      if (row === undefined) return Promise.reject(new ItemGoneError(itemId));
      return writes.updateItem(row, { scope: 'all', changes });
    },
    failed: (error): void => {
      notify({ message: 'Couldn’t save that change', error, tone: 'critical' });
    },
  };
});

export function useItemSaves(person: PlannerPerson, itemId: string): QueuedSaves<ItemChanges> {
  return useQueuedSaves(itemQueueOf, person, itemId);
}

export interface GuestListChange {
  readonly entries: readonly PlannerGuestEntry[];
}

export const guestQueueOf = keyedQueues<GuestListChange>((store, person, itemId) => {
  const writes = guestWrites(store, person);
  return {
    event: 'planner_guest.save',
    send: (change): Promise<PlannerGuestRow[]> => writes.setGuests(itemId, change.entries),
    failed: (error): void => {
      notify({ message: 'Couldn’t change the guests', error, tone: 'critical' });
    },
  };
});

export function useGuestSaves(person: PlannerPerson, itemId: string): QueuedSaves<GuestListChange> {
  return useQueuedSaves(guestQueueOf, person, itemId);
}
