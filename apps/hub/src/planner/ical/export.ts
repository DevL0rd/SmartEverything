import {
  appendTo,
  type PlannerCollectionRow,
  type PlannerGuestRow,
  type PlannerItemRow,
} from '@smarteverything/domain';
import type { Store } from '../../store/store';
import type { ExportRows } from '../units/ical';
import { entryOfRows, localUidOf } from './map-item';
import type { IcalEntry } from './model';
import { writeCalendar } from './write';

function uidOfRow(row: PlannerItemRow): string {
  return row.ical_uid ?? localUidOf(row.id);
}

function entriesOf({ rows, guests, completed }: ExportRows): IcalEntry[] {
  const masters = rows.filter((row) => row.series_id === null);
  const uids = new Map(masters.map((row) => [row.id, uidOfRow(row)]));
  const grouped = new Map<string, PlannerGuestRow[]>();
  for (const guest of guests) appendTo(grouped, guest.item_id, guest);
  return masters.map((master) =>
    entryOfRows({
      master,
      parentUid: master.parent_id === null ? null : (uids.get(master.parent_id) ?? null),
      overrides: rows.filter((row) => row.series_id === master.id),
      guests: grouped.get(master.id) ?? [],
      completedAt: completed.get(master.id) ?? null,
    }),
  );
}

export async function exportCollectionText(
  store: Pick<Store, 'host'>,
  collection: Pick<PlannerCollectionRow, 'id' | 'name'>,
  now: Date,
  withGuests = true,
): Promise<string> {
  const rows = await store.host.read('plannerExportCollection', {
    collectionId: collection.id,
    withGuests,
  });
  return writeCalendar(entriesOf(rows), { name: collection.name, now });
}

export async function exportItemText(
  store: Pick<Store, 'host'>,
  item: PlannerItemRow,
  now: Date,
): Promise<string> {
  const rows = await store.host.read('plannerExportItem', { item });
  return writeCalendar(entriesOf(rows), { name: null, now });
}
