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
const PASSIVE_KEYS: readonly CapabilityKey[] = ['contact'];

export interface PassiveSource {
  readonly keys: readonly CapabilityKey[];
  readonly values: ReadonlyMap<CapabilityKey, JsonValue>;
  readonly freshUntil: number;
}

type HostStore = Pick<Store, 'host'>;

export interface PassiveObservationsOptions {
  readonly store: HostStore;
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

export function linkedDevice(
  store: HostStore,
  entry: LocalDeviceEntry,
): Promise<DeviceRow | undefined> {
  return store.host.read('passiveLinked', entry);
}

function keyEpochOf(secrets: SecretStore, entry: LocalDeviceEntry): string | null {
  const key = secrets.deviceKey(entry.externalId);
  return key === null ? null : hash(key);
}

export async function passiveSource(
  store: HostStore,
  secrets: SecretStore,
  entry: LocalDeviceEntry,
  deviceId: string,
): Promise<PassiveSource> {
  const found = await store.host.read('passiveRead', {
    deviceId,
    keyEpoch: keyEpochOf(secrets, entry),
    keys: PASSIVE_KEYS,
  });
  return {
    keys: PASSIVE_KEYS,
    values: new Map(found.values),
    freshUntil: found.cursor === undefined ? 0 : freshUntilOf(found.cursor),
  };
}

export class PassiveObservations {
  constructor(private readonly options: PassiveObservationsOptions) {}

  device(entry: LocalDeviceEntry): Promise<DeviceRow | undefined> {
    return linkedDevice(this.options.store, entry);
  }

  async restore(): Promise<void> {
    for (const entry of await this.options.store.host.call('localDevices', 'list')) {
      if (
        LOCAL_DRIVER_REGISTRY[entry.driver].provider !== 'local' &&
        this.options.eligible(entry)
      ) {
        await this.restoreEntry(entry);
      }
    }
  }

  async restoreEntry(entry: LocalDeviceEntry): Promise<void> {
    const { store, secrets } = this.options;
    this.options.sourceChanged(
      entry.externalId,
      await passiveSource(store, secrets, entry, await this.deviceId(entry)),
    );
  }

  disable(entry: LocalDeviceEntry): void {
    this.options.sourceChanged(entry.externalId, null);
  }

  async status(deviceId: string): Promise<{
    readonly configured: boolean;
    readonly address: string | null;
    readonly lastSeenAt: string | null;
    readonly freshUntil: string | null;
    readonly blockedReason: string | null;
  }> {
    const { store, secrets } = this.options;
    const entry = await store.host.read('passiveEntryOfDevice', deviceId);
    if (entry === undefined) {
      return {
        configured: false,
        address: null,
        lastSeenAt: null,
        freshUntil: null,
        blockedReason: null,
      };
    }
    const { cursor } = await store.host.read('passiveRead', {
      deviceId,
      keyEpoch: keyEpochOf(secrets, entry),
      keys: [],
    });
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
    const deviceId = await this.deviceId(entry);
    const cursor = {
      device_id: deviceId,
      key_epoch: hash(key),
      counter: decoded.counter,
      frame_hash: hash(advert.data),
      seen_at: new Date(advert.seenAt).toISOString(),
      received_at: this.options.now().toISOString(),
    };
    const row: StateRecord | null =
      decoded.contact === null
        ? null
        : {
            deviceId,
            capability: 'contact',
            value: decoded.contact,
            observedAt: cursor.seen_at,
          };
    const commit = { entry, cursor, row, now: this.options.now().toISOString() };
    if (
      !this.current(entry, key) ||
      !(await this.options.store.host.read('passiveAdmissible', commit))
    ) {
      return false;
    }
    this.options.sourceChanged(entry.externalId, {
      keys: PASSIVE_KEYS,
      values: new Map(),
      freshUntil: freshUntilOf(cursor),
    });
    try {
      return await this.options.state.commitObservation(row, async () =>
        this.current(entry, key)
          ? await this.options.store.host.write('passiveCommit', commit)
          : false,
      );
    } finally {
      await this.restoreCurrent(entry);
    }
  }

  private async restoreCurrent(entry: LocalDeviceEntry): Promise<void> {
    const entries = await this.options.store.host.call('localDevices', 'list');
    if (entries.some((candidate) => candidate.externalId === entry.externalId)) {
      await this.restoreEntry(entry);
    } else {
      this.disable(entry);
    }
  }

  private async deviceId(entry: LocalDeviceEntry): Promise<string> {
    const device = await this.device(entry);
    if (device === undefined) {
      throw new ApiError(
        'conflict',
        'The Bluetooth link no longer matches its original Xiaomi device.',
      );
    }
    return device.id;
  }

  private current(entry: LocalDeviceEntry, key: string): boolean {
    return this.options.eligible(entry) && this.options.secrets.deviceKey(entry.externalId) === key;
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
