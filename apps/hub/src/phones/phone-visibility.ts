import {
  phoneEventFor,
  phoneValueHidden,
  type DeviceRow,
  type EventRow,
  type PhoneTier,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import { tierOfViewer, type PhoneViewer } from './phone-detail';

interface StateKey {
  readonly device_id: string;
  readonly capability: string;
}

type PhoneDeviceFacts = Pick<DeviceRow, 'id' | 'kind' | 'details'>;

export function otherPhoneTiers(
  devices: readonly PhoneDeviceFacts[],
  viewer: PhoneViewer,
): ReadonlyMap<string, PhoneTier> {
  const tiers = new Map<string, PhoneTier>();
  for (const device of devices) {
    const profileId = device.details['profileId'];
    if (device.kind !== 'phone' || typeof profileId !== 'string') continue;
    const tier = tierOfViewer({ profileId }, viewer);
    if (tier !== 'person') tiers.set(device.id, tier);
  }
  return tiers;
}

export function valueHiddenByTier(tiers: ReadonlyMap<string, PhoneTier>, row: StateKey): boolean {
  const tier = tiers.get(row.device_id);
  return tier !== undefined && phoneValueHidden(row.capability, tier);
}

export function visiblePhoneValues<Row extends StateKey>(
  tiers: ReadonlyMap<string, PhoneTier>,
  rows: readonly Row[],
): Row[] {
  return rows.filter((row) => !valueHiddenByTier(tiers, row));
}

function phoneDevicesOf(store: Pick<Store, 'devices'>, ids: Iterable<string>): DeviceRow[] {
  return [...new Set(ids)].flatMap((id) => {
    const device = store.devices.find(id);
    return device === undefined ? [] : [device];
  });
}

export function visibleRows<Row extends StateKey>(
  store: Pick<Store, 'devices'>,
  viewer: PhoneViewer,
  rows: readonly Row[],
): Row[] {
  const devices = phoneDevicesOf(
    store,
    rows.map((row) => row.device_id),
  );
  return visiblePhoneValues(otherPhoneTiers(devices, viewer), rows);
}

export function phoneEventOf(
  tiers: ReadonlyMap<string, PhoneTier>,
  event: EventRow,
): EventRow | null {
  const tier = event.device_id === null ? undefined : tiers.get(event.device_id);
  return tier === undefined ? event : phoneEventFor(event, tier);
}

export function eventVisibleTo(viewer: PhoneViewer, event: EventRow): boolean {
  if (event.kind !== 'signal' || viewer.role === 'owner') return true;
  if (event.details['ownerOnly'] === true) return false;
  const owner = event.details['profileId'];
  return typeof owner !== 'string' || owner === viewer.profileId;
}

export function visibleEvents(
  store: Pick<Store, 'devices'>,
  viewer: PhoneViewer,
  allEvents: readonly EventRow[],
): EventRow[] {
  const events = allEvents.filter((event) => eventVisibleTo(viewer, event));
  const devices = phoneDevicesOf(
    store,
    events.flatMap((event) => (event.device_id === null ? [] : [event.device_id])),
  );
  const tiers = otherPhoneTiers(devices, viewer);
  return events.flatMap((event) => {
    const shown = phoneEventOf(tiers, event);
    return shown === null ? [] : [shown];
  });
}
