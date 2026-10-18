import { createHash } from 'node:crypto';
import {
  ApiError,
  type BleAdvert,
  type CapabilityKey,
  type DeviceRow,
  type JsonValue,
} from '@smarteverything/domain';
import type { StateRecord } from '../database/port';
import type { SecretStore } from '../secrets/store';
import type { StateWriter } from '../state/state-writer';
import type { LocalDeviceEntry } from '../store/repositories/local-devices';
import type { BleObservationCursor } from '../store/repositories/ble-observations';
import type { Store } from '../store/store';
import type { DecodedAdvert } from './driver-types';
import { LOCAL_DRIVER_REGISTRY } from './drivers';

const BLE_RECEIVER_FRESH_MS = 120_000;
const FUTURE_TOLERANCE_MS = 5000;
const COUNTER_RESET_GAP_MS = 60_000;
const PASSIVE_KEYS: readonly CapabilityKey[] = ['contact'];

export interface PassiveSource {
  readonly keys: readonly CapabilityKey[];
  readonly values: ReadonlyMap<CapabilityKey, JsonValue>;
  readonly freshUntil: number;
}

export interface PassiveObservationsOptions {
  readonly store: Store;
  readonly secrets: SecretStore;
  readonly state: Pick<StateWriter, 'commitObservation'>;
  readonly now: () => Date;
  readonly eligible: (entry: LocalDeviceEntry) => boolean;
  readonly sourceChanged: (externalId: string, source: PassiveSource | null) => void;
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function freshUntilOf(cursor: BleObservationCursor): number {
  return (
    Math.min(Date.parse(cursor.seen_at), Date.parse(cursor.received_at)) + BLE_RECEIVER_FRESH_MS
  );
}

function advances(previous: BleObservationCursor, next: BleObservationCursor): boolean {
  if (next.frame_hash === previous.frame_hash) {
    return false;
  }
  return (
    next.counter > previous.counter ||
    Date.parse(next.seen_at) - Date.parse(previous.seen_at) >= COUNTER_RESET_GAP_MS
  );
}

export function linkedDevice(store: Store, entry: LocalDeviceEntry): DeviceRow | undefined {
  const deviceId = entry.config['deviceId'];
  const device = typeof deviceId === 'string' ? store.devices.find(deviceId) : undefined;
  return device?.provider === LOCAL_DRIVER_REGISTRY[entry.driver].provider &&
    device.external_id === entry.externalId &&
    device.model === entry.config['model']
    ? device
    : undefined;
}

function latestCursor(
  store: Store,
  secrets: SecretStore,
  entry: LocalDeviceEntry,
  deviceId: string,
): BleObservationCursor | undefined {
  const key = secrets.deviceKey(entry.externalId);
  return key === null ? undefined : store.bleObservations.cursor(deviceId, hash(key));
}

export function passiveSource(
  store: Store,
  secrets: SecretStore,
  entry: LocalDeviceEntry,
  deviceId: string,
): PassiveSource {
  const cursor = latestCursor(store, secrets, entry, deviceId);
  const values = new Map<CapabilityKey, JsonValue>();
  for (const capability of PASSIVE_KEYS) {
    const value = store.state.value(deviceId, capability);
    if (value !== undefined) {
      values.set(capability, value);
    }
  }
  return {
    keys: PASSIVE_KEYS,
    values,
    freshUntil: cursor === undefined ? 0 : freshUntilOf(cursor),
  };
}

export class PassiveObservations {
  constructor(private readonly options: PassiveObservationsOptions) {}

  device(entry: LocalDeviceEntry): DeviceRow | undefined {
    return linkedDevice(this.options.store, entry);
  }

  restore(): void {
    for (const entry of this.options.store.localDevices.list()) {
      if (
        LOCAL_DRIVER_REGISTRY[entry.driver].provider !== 'local' &&
        this.options.eligible(entry)
      ) {
        this.restoreEntry(entry);
      }
    }
  }

  restoreEntry(entry: LocalDeviceEntry): void {
    const { store, secrets } = this.options;
    this.options.sourceChanged(
      entry.externalId,
      passiveSource(store, secrets, entry, this.deviceId(entry)),
    );
  }

  disable(entry: LocalDeviceEntry): void {
    this.options.sourceChanged(entry.externalId, null);
  }

  status(deviceId: string): {
    readonly configured: boolean;
    readonly address: string | null;
    readonly lastSeenAt: string | null;
    readonly freshUntil: string | null;
    readonly blockedReason: string | null;
  } {
    const { store, secrets } = this.options;
    const entry = store.localDevices
      .list()
      .find((candidate) => candidate.config['deviceId'] === deviceId);
    if (entry === undefined) {
      return {
        configured: false,
        address: null,
        lastSeenAt: null,
        freshUntil: null,
        blockedReason: null,
      };
    }
    const cursor = latestCursor(store, secrets, entry, deviceId);
    const freshUntil = cursor === undefined ? null : new Date(freshUntilOf(cursor)).toISOString();
    const blockedReason = !this.options.eligible(entry)
      ? 'This door is no longer linked to the same Xiaomi account and device, so Bluetooth updates are paused; cloud updates continue.'
      : secrets.deviceKey(entry.externalId) === null
        ? 'The hub has no stored Bluetooth key; enable observation again.'
        : this.freshnessReason(freshUntil);
    return {
      configured: true,
      address: entry.address,
      lastSeenAt: cursor?.seen_at ?? null,
      freshUntil,
      blockedReason,
    };
  }

  async receive(
    entry: LocalDeviceEntry,
    advert: BleAdvert,
    key: string,
    decoded: Extract<DecodedAdvert, { kind: 'state' }>,
  ): Promise<boolean> {
    const deviceId = this.deviceId(entry);
    const cursor = {
      device_id: deviceId,
      key_epoch: hash(key),
      counter: decoded.counter,
      frame_hash: hash(advert.data),
      seen_at: new Date(advert.seenAt).toISOString(),
      received_at: this.options.now().toISOString(),
    };
    if (!this.admissible(entry, key, cursor)) {
      return false;
    }
    const row: StateRecord | null =
      decoded.contact === null
        ? null
        : {
            deviceId,
            capability: 'contact',
            value: decoded.contact,
            observedAt: cursor.seen_at,
          };
    this.options.sourceChanged(entry.externalId, {
      keys: PASSIVE_KEYS,
      values: new Map(),
      freshUntil: freshUntilOf(cursor),
    });
    try {
      return await this.options.state.commitObservation(row, () =>
        this.commit(entry, key, cursor, row),
      );
    } finally {
      this.restoreCurrent(entry);
    }
  }

  private commit(
    entry: LocalDeviceEntry,
    key: string,
    cursor: BleObservationCursor,
    row: StateRecord | null,
  ): boolean {
    return this.options.store.write(() => {
      if (!this.admissible(entry, key, cursor)) {
        return false;
      }
      this.options.store.bleObservations.save(cursor);
      if (row !== null) {
        this.options.store.state.write([row]);
      }
      return true;
    });
  }

  private admissible(entry: LocalDeviceEntry, key: string, cursor: BleObservationCursor): boolean {
    const previous = this.options.store.bleObservations.cursor(cursor.device_id, cursor.key_epoch);
    return (
      this.current(entry, key) &&
      Date.parse(cursor.seen_at) <= this.options.now().getTime() + FUTURE_TOLERANCE_MS &&
      (previous === undefined || advances(previous, cursor))
    );
  }

  private restoreCurrent(entry: LocalDeviceEntry): void {
    if (
      this.options.store.localDevices
        .list()
        .some((candidate) => candidate.externalId === entry.externalId)
    ) {
      this.restoreEntry(entry);
    } else {
      this.disable(entry);
    }
  }

  private deviceId(entry: LocalDeviceEntry): string {
    const device = this.device(entry);
    if (device === undefined) {
      throw new ApiError(
        'conflict',
        'The Bluetooth link no longer matches its original Xiaomi device.',
      );
    }
    return device.id;
  }

  private current(entry: LocalDeviceEntry, key: string): boolean {
    return (
      this.options.eligible(entry) &&
      this.options.secrets.deviceKey(entry.externalId) === key &&
      this.options.store.localDevices
        .list()
        .some(
          (candidate) =>
            candidate.externalId === entry.externalId && candidate.address === entry.address,
        )
    );
  }

  private freshnessReason(freshUntil: string | null): string | null {
    if (freshUntil === null) {
      return 'Waiting for a broadcast from a listening phone; cloud updates continue.';
    }
    return Date.parse(freshUntil) > this.options.now().getTime()
      ? null
      : 'No recent Bluetooth broadcast; cloud updates are active.';
  }
}
