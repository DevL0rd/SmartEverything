import type { CapabilityKey, DeviceRow, JsonValue } from '@smarteverything/domain';
import type { StateRecord } from '../database/port';
import { storeUnit } from '../store/host/unit';
import type { BleObservationCursor } from '../store/repositories/ble-observations';
import type { LocalDeviceEntry } from '../store/repositories/local-devices';
import type { HostStore } from '../store/host/host-store';
import { LOCAL_DRIVER_REGISTRY } from './drivers';

const FUTURE_TOLERANCE_MS = 5000;
const COUNTER_RESET_GAP_MS = 60_000;

export interface LocalSight {
  readonly entries: LocalDeviceEntry[];
  readonly devices: Record<string, DeviceRow>;
}

function deviceOfEntry(store: HostStore, entry: LocalDeviceEntry): DeviceRow | undefined {
  return store.devices.byExternal(LOCAL_DRIVER_REGISTRY[entry.driver].provider, entry.externalId);
}

export const LOCAL_SIGHT_UNIT = storeUnit((store, _input: null): LocalSight => {
  const entries = store.localDevices.list();
  const devices: Record<string, DeviceRow> = {};
  for (const entry of entries) {
    const device = deviceOfEntry(store, entry);
    if (device !== undefined) devices[entry.externalId] = device;
  }
  return { entries, devices };
});

export const LOCAL_ENTRY_DEVICE_UNIT = storeUnit(
  (store, entry: LocalDeviceEntry): DeviceRow | undefined => deviceOfEntry(store, entry),
);

export function linkedDevice(store: HostStore, entry: LocalDeviceEntry): DeviceRow | undefined {
  const deviceId = entry.config['deviceId'];
  const device = typeof deviceId === 'string' ? store.devices.find(deviceId) : undefined;
  return device?.provider === LOCAL_DRIVER_REGISTRY[entry.driver].provider &&
    device.external_id === entry.externalId &&
    device.model === entry.config['model']
    ? device
    : undefined;
}

export const PASSIVE_LINKED_UNIT = storeUnit(
  (store, entry: LocalDeviceEntry): DeviceRow | undefined => linkedDevice(store, entry),
);

export interface PassiveRead {
  readonly deviceId: string;
  readonly keyEpoch: string | null;
  readonly keys: readonly CapabilityKey[];
}

export interface PassiveFound {
  readonly cursor: BleObservationCursor | undefined;
  readonly values: [CapabilityKey, JsonValue][];
}

export const PASSIVE_READ_UNIT = storeUnit(
  (store, { deviceId, keyEpoch, keys }: PassiveRead): PassiveFound => ({
    cursor: keyEpoch === null ? undefined : store.bleObservations.cursor(deviceId, keyEpoch),
    values: keys.flatMap((capability): [CapabilityKey, JsonValue][] => {
      const value = store.state.value(deviceId, capability);
      return value === undefined ? [] : [[capability, value]];
    }),
  }),
);

export const PASSIVE_ENTRY_OF_DEVICE_UNIT = storeUnit(
  (store, deviceId: string): LocalDeviceEntry | undefined =>
    store.localDevices.list().find((candidate) => candidate.config['deviceId'] === deviceId),
);

export function advances(previous: BleObservationCursor, next: BleObservationCursor): boolean {
  if (next.frame_hash === previous.frame_hash) {
    return false;
  }
  return (
    next.counter > previous.counter ||
    Date.parse(next.seen_at) - Date.parse(previous.seen_at) >= COUNTER_RESET_GAP_MS
  );
}

export interface PassiveCommit {
  readonly entry: LocalDeviceEntry;
  readonly cursor: BleObservationCursor;
  readonly row: StateRecord | null;
  readonly now: string;
}

function admissible(store: HostStore, { entry, cursor, now }: PassiveCommit): boolean {
  const previous = store.bleObservations.cursor(cursor.device_id, cursor.key_epoch);
  return (
    store.localDevices
      .list()
      .some(
        (candidate) =>
          candidate.externalId === entry.externalId && candidate.address === entry.address,
      ) &&
    Date.parse(cursor.seen_at) <= Date.parse(now) + FUTURE_TOLERANCE_MS &&
    (previous === undefined || advances(previous, cursor))
  );
}

export const PASSIVE_ADMISSIBLE_UNIT = storeUnit((store, commit: PassiveCommit): boolean =>
  admissible(store, commit),
);

export const PASSIVE_COMMIT_UNIT = storeUnit((store, commit: PassiveCommit): boolean => {
  if (!admissible(store, commit)) return false;
  store.bleObservations.save(commit.cursor);
  if (commit.row !== null) store.state.write([commit.row]);
  return true;
});

export interface ConfigChange {
  readonly externalId: string;
  readonly config: Readonly<Record<string, JsonValue>>;
}

export const LOCAL_CONFIG_UNIT = storeUnit(
  (store, { externalId, config }: ConfigChange): LocalDeviceEntry => {
    store.localDevices.updateConfig(externalId, config);
    return store.localDevices.byExternalId(externalId);
  },
);
