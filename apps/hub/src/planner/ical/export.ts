import {
  PLANNER_OCCURRENCE_SINGLE,
  appendTo,
  type PlannerCollectionRow,
  type PlannerGuestRow,
  type PlannerItemRow,
} from '@smarteverything/domain';
import type { Store } from '../../store/store';
import { entryOfRows, localUidOf } from './map-item';
import type { IcalEntry } from './model';
import { writeCalendar } from './write';

export type ExportStore = Pick<Store, 'plannerItems' | 'plannerGuests' | 'plannerOccurrences'>;

function uidOfRow(row: PlannerItemRow): string {
  return row.ical_uid ?? localUidOf(row.id);
}

function guestsByItem(
  store: ExportStore,
  masters: readonly PlannerItemRow[],
): Map<string, PlannerGuestRow[]> {
  const grouped = new Map<string, PlannerGuestRow[]>();
  if (masters.length === 0) return grouped;
  for (const guest of store.plannerGuests.forItems(masters.map((row) => row.id))) {
    appendTo(grouped, guest.item_id, guest);
  }
  return grouped;
}

function completedAtOf(store: ExportStore, tasks: readonly PlannerItemRow[]): Map<string, string> {
  const done = new Map<string, string>();
  if (tasks.length === 0) return done;
  for (const row of store.plannerOccurrences.forItems(tasks.map((task) => task.id))) {
    if (row.occurrence_key === PLANNER_OCCURRENCE_SINGLE && row.completed_at !== null) {
      done.set(row.item_id, row.completed_at);
    }
  }
  return done;
}

export function entriesOfRows(
  store: ExportStore,
  rows: readonly PlannerItemRow[],
  withGuests = true,
): IcalEntry[] {
  const masters = rows.filter((row) => row.series_id === null);
  const uids = new Map(masters.map((row) => [row.id, uidOfRow(row)]));
  const guests = withGuests
    ? guestsByItem(
        store,
        masters.filter((row) => row.kind === 'event'),
      )
    : new Map<string, PlannerGuestRow[]>();
  const done = completedAtOf(
    store,
    masters.filter((row) => row.kind === 'task'),
  );
  return masters.map((master) =>
    entryOfRows({
      master,
      parentUid: master.parent_id === null ? null : (uids.get(master.parent_id) ?? null),
      overrides: rows.filter((row) => row.series_id === master.id),
      guests: guests.get(master.id) ?? [],
      completedAt: done.get(master.id) ?? null,
    }),
  );
}

export function exportCollectionText(
  store: ExportStore,
  collection: Pick<PlannerCollectionRow, 'id' | 'name'>,
  now: Date,
  withGuests = true,
): string {
  const rows = store.plannerItems.inCollection(collection.id);
  return writeCalendar(entriesOfRows(store, rows, withGuests), { name: collection.name, now });
}

export function exportItemText(store: ExportStore, item: PlannerItemRow, now: Date): string {
  const root = item.series_id === null ? item : store.plannerItems.anyById(item.series_id);
  const family = [
    root,
    ...store.plannerItems.children(root.id, root.profile_id),
    ...store.plannerItems.overrides(root.id, root.profile_id),
  ];
  return writeCalendar(entriesOfRows(store, family), { name: null, now });
}
