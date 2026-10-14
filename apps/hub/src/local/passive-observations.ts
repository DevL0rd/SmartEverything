import { createHash } from 'node:crypto';
import {
  ApiError,
  type BleAdvert,
  type DeviceRow,
  type StateUpdate,
} from '@smarteverything/domain';
import type { SecretStore } from '../secrets/store';
import type { StateWriter } from '../state/state-writer';
import type { LocalDeviceEntry } from '../store/repositories/local-devices';
import type { BleObservationCursor } from '../store/repositories/ble-observations';
import type { Store } from '../store/store';
import type { DecodedAdvert } from './driver-types';
import { LOCAL_DRIVER_REGISTRY } from './drivers';

export const BLE_RECEIVER_FRESH_MS = 120_000;
const FUTURE_TOLERANCE_MS = 5000;

export interface PassiveSource {
  readonly update: StateUpdate | null;
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

export class PassiveObservations {
  constructor(private readonly options: PassiveObservationsOptions) {}

  device(entry: LocalDeviceEntry): DeviceRow | undefined {
    const driver = LOCAL_DRIVER_REGISTRY[entry.driver];
    const deviceId = entry.config['deviceId'];
    if (typeof deviceId === 'string') {
      const device = this.options.store.devices.find(deviceId);
      return device?.provider === driver.provider && device.external_id === entry.externalId
        ? device
        : undefined;
    }
    return undefined;
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
    const status = this.status(this.deviceId(entry));
    const value = this.options.store.state
      .list()
      .find((row) => row.device_id === this.deviceId(entry) && row.capability === 'contact');
    this.options.sourceChanged(entry.externalId, {
      update:
        value === undefined
          ? null
          : {
              externalId: entry.externalId,
              capability: 'contact',
              value: value.value,
              observedAt: value.observed_at,
            },
      freshUntil: status.freshUntil === null ? 0 : Date.parse(status.freshUntil),
    });
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
    const entry = this.options.store.localDevices
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
    const key = this.options.secrets.deviceKey(entry.externalId);
    const cursor =
      key === null ? undefined : this.options.store.bleObservations.cursor(deviceId, hash(key));
    const freshUntil =
      cursor === undefined
        ? null
        : new Date(
            Math.min(Date.parse(cursor.seen_at), Date.parse(cursor.received_at)) +
              BLE_RECEIVER_FRESH_MS,
          ).toISOString();
    const blockedReason = !this.options.eligible(entry)
      ? 'The linked Xiaomi account or inventory no longer matches this observation; cloud updates remain active.'
      : key === null
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
    const update: StateUpdate | null =
      decoded.contact === null
        ? null
        : {
            externalId: entry.externalId,
            capability: 'contact',
            value: decoded.contact,
            observedAt: cursor.seen_at,
          };
    if (!this.admissible(entry, key, cursor)) {
      return false;
    }
    return this.admit(entry, key, cursor, update);
  }

  private async admit(
    entry: LocalDeviceEntry,
    key: string,
    cursor: BleObservationCursor,
    update: StateUpdate | null,
  ): Promise<boolean> {
    this.options.sourceChanged(entry.externalId, {
      update: null,
      freshUntil: this.freshUntil(cursor),
    });
    try {
      const commit = (): boolean => this.commit(entry, key, cursor, update);
      const row = update === null ? null : { deviceId: cursor.device_id, ...update };
      const accepted = await this.options.state.commitObservation(row, commit);
      if (accepted) {
        this.options.sourceChanged(entry.externalId, {
          update,
          freshUntil: this.freshUntil(cursor),
        });
      } else {
        this.restoreCurrent(entry);
      }
      return accepted;
    } catch (cause) {
      this.restoreCurrent(entry);
      throw cause;
    }
  }

  private commit(
    entry: LocalDeviceEntry,
    key: string,
    cursor: BleObservationCursor,
    update: StateUpdate | null,
  ): boolean {
    return this.options.store.write(() => {
      if (!this.admissible(entry, key, cursor)) {
        return false;
      }
      this.options.store.bleObservations.save(cursor);
      if (update !== null) {
        this.options.store.state.write([{ deviceId: cursor.device_id, ...update }]);
      }
      return true;
    });
  }

  private admissible(entry: LocalDeviceEntry, key: string, cursor: BleObservationCursor): boolean {
    const previous = this.options.store.bleObservations.cursor(cursor.device_id, cursor.key_epoch);
    return (
      this.current(entry, key) &&
      this.freshUntil(cursor) > this.options.now().getTime() &&
      Date.parse(cursor.seen_at) <= this.options.now().getTime() + FUTURE_TOLERANCE_MS &&
      (previous === undefined ||
        (cursor.counter > previous.counter && cursor.seen_at >= previous.seen_at))
    );
  }

  private freshUntil(cursor: BleObservationCursor): number {
    return (
      Math.min(Date.parse(cursor.seen_at), Date.parse(cursor.received_at)) + BLE_RECEIVER_FRESH_MS
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
    if (
      device === undefined ||
      device.id !== entry.config['deviceId'] ||
      device.model !== entry.config['model']
    ) {
      throw new ApiError(
        'conflict',
        'The passive Bluetooth linkage no longer matches its original Xiaomi device.',
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
      return 'Waiting for an authenticated advert from a listening phone; cloud updates remain active.';
    }
    return Date.parse(freshUntil) > this.options.now().getTime()
      ? null
      : 'No recent authenticated Bluetooth observation; cloud updates are active. Counter regressions and resets cannot rearm the receiver.';
  }
}
