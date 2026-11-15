import ICAL from 'ical.js';
import type { PlannerGuestRow, PlannerItemRow } from '@smarteverything/domain';
import type { Store } from '../../store/store';
import { entryOfRows } from '../ical/map-item';
import { writeCalendar } from '../ical/write';

export type ItipMethod = 'REQUEST' | 'CANCEL';

export interface Organiser {
  readonly address: string;
  readonly name: string | null;
}

export type ItipStore = Pick<Store, 'plannerItems' | 'plannerGuests'>;

function withMethod(text: string, method: ItipMethod, organiser: Organiser): string {
  const calendar = ICAL.Component.fromString(text);
  calendar.updatePropertyWithValue('method', method);
  for (const event of calendar.getAllSubcomponents('vevent')) {
    const property = new ICAL.Property('organizer');
    property.setValue(`mailto:${organiser.address}`);
    if (organiser.name !== null) property.setParameter('cn', organiser.name);
    event.addProperty(property);
  }
  return calendar.toString();
}

export function itipText(
  store: ItipStore,
  item: PlannerItemRow,
  guests: readonly PlannerGuestRow[],
  options: { readonly method: ItipMethod; readonly organiser: Organiser; readonly now: Date },
): string {
  const entry = entryOfRows({
    master: item,
    parentUid: null,
    overrides: store.plannerItems.overrides(item.id, item.profile_id),
    guests,
    completedAt: null,
  });
  const sent = options.method === 'CANCEL' ? { ...entry, cancelled: true } : entry;
  return withMethod(
    writeCalendar([sent], { name: null, now: options.now }),
    options.method,
    options.organiser,
  );
}
