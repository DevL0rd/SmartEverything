import {
  CcmTagMismatchError,
  MiBeaconFormatError,
  ScalePacketError,
  MagnetPacketError,
} from '@smarteverything/ble';
import {
  ApiError,
  type BleAdvert,
  type BleWatch,
  type DeviceRow,
  type DiscoveredDevice,
  type JsonValue,
  type LocalDeviceSetup,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { DeviceRecord } from '../database/port';
import type { SecretStore } from '../secrets/store';
import type { Store } from '../store/store';
import type { LocalDeviceEntry } from '../store/repositories/local-devices';
import { LOCAL_DRIVER_REGISTRY } from './drivers';
import type { Observed } from './driver-types';
import { resolveSetup } from './setup';
import type { BluetoothIdentitySource, WearableSource } from './setup-types';
import { PassiveObservations, type PassiveObservationsOptions } from './passive-observations';
import type { ScaleReadings } from './scale-readings';
import { UnexpectedScaleFrameError } from './xiaomi-scale';
import { failureLine } from '@smarteverything/logging';

export interface LocalDevicesOptions {
  readonly state: PassiveObservationsOptions['state'];
  readonly eligible: PassiveObservationsOptions['eligible'];
  readonly sourceChanged: PassiveObservationsOptions['sourceChanged'];
  readonly store: Store;
  readonly secrets: SecretStore;
  readonly readings: ScaleReadings;
  readonly identities: BluetoothIdentitySource;
  readonly wearables: WearableSource;
  readonly apply: (devices: readonly DiscoveredDevice[]) => Promise<readonly DeviceRecord[]>;
  readonly forget: (externalIds: readonly string[]) => Promise<void>;
  readonly log: Logger;
  readonly now: () => Date;
}

export interface RelayOutcome {
  readonly accepted: number;
  readonly ignored: number;
  readonly readings: string[];
}

type Received =
  | { readonly kind: 'reading'; readonly id: string }
  | { readonly kind: 'idle' }
  | { readonly kind: 'ignored' };

const UNREADABLE: readonly (new (...args: never[]) => Error)[] = [
  CcmTagMismatchError,
  MiBeaconFormatError,
  ScalePacketError,
  UnexpectedScaleFrameError,
  MagnetPacketError,
];

export class LocalDevices {
  private readonly observed = new Map<string, Observed>();

  private readonly passive: PassiveObservations;
  private relaying: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: LocalDevicesOptions) {
    this.passive = new PassiveObservations(options);
  }

  readiness(deviceId: string): ReturnType<PassiveObservations['status']> {
    return this.passive.status(deviceId);
  }

  async start(): Promise<void> {
    await this.options.apply(this.discovered());
    this.passive.restore();
  }

  watch(requestedBy: string): BleWatch {
    const devices = this.options.store.localDevices.list().flatMap((entry) => {
      const adverts = LOCAL_DRIVER_REGISTRY[entry.driver].adverts;
      return adverts === null ||
        (LOCAL_DRIVER_REGISTRY[entry.driver].provider !== 'local' &&
          (!this.options.eligible(entry) ||
            this.options.secrets.deviceKey(entry.externalId) === null))
        ? []
        : [adverts.watch(entry)];
    });
    this.options.log.info('local.watch_served', { requestedBy, devices: devices.length });
    return { devices };
  }

  async add(setup: LocalDeviceSetup): Promise<DeviceRow> {
    const { store, secrets } = this.options;
    const resolved = await resolveSetup(setup, {
      store,
      secrets,
      identities: this.options.identities,
      wearables: this.options.wearables,
    });
    if (store.localDevices.list().some((entry) => entry.address === resolved.entry.address)) {
      throw new ApiError(
        'conflict',
        `A built-in device at ${resolved.entry.address} already exists.`,
      );
    }
    await secrets.saveDeviceKey(resolved.entry.externalId, resolved.key);
    store.localDevices.add(resolved.entry);
    if (LOCAL_DRIVER_REGISTRY[resolved.entry.driver].provider !== 'local') {
      this.passive.restoreEntry({ ...resolved.entry, createdAt: this.options.now().toISOString() });
      const original = this.passive.device({
        ...resolved.entry,
        createdAt: this.options.now().toISOString(),
      });
      if (original === undefined) {
        throw new ApiError(
          'conflict',
          'The original Xiaomi device disappeared during Bluetooth setup.',
        );
      }
      return store.devices.byId(original.id);
    }
    if (resolved.replaces !== null) {
      store.devices.update(resolved.replaces, { hidden: true });
    }
    const saved = (await this.options.apply(this.discovered())).find(
      (device) => device.externalId === resolved.entry.externalId,
    );
    this.options.log.info('local.device_added', { driver: setup.driver, source: setup.source });
    if (saved === undefined) {
      throw new ApiError('internal', 'The new device was not saved.');
    }
    return store.devices.byId(saved.id);
  }

  async remove(device: DeviceRow): Promise<void> {
    const { store, secrets } = this.options;
    const observer = store.localDevices
      .list()
      .find(
        (entry) =>
          entry.externalId === device.external_id &&
          LOCAL_DRIVER_REGISTRY[entry.driver].provider === device.provider,
      );
    if (observer !== undefined && LOCAL_DRIVER_REGISTRY[observer.driver].provider !== 'local') {
      store.localDevices.remove(observer.externalId);
      await secrets.removeDeviceKey(observer.externalId);
      this.passive.disable(observer);
      return;
    }
    if (device.provider !== 'local') {
      throw new ApiError('invalid_request', `${device.name} is not a built-in device.`);
    }
    const entry = store.localDevices.byExternalId(device.external_id);
    const replaces = entry.config['replaces'];
    store.localDevices.remove(entry.externalId);
    this.observed.delete(entry.externalId);
    await secrets.removeDeviceKey(entry.externalId);
    await this.options.forget([entry.externalId]);
    if (typeof replaces === 'string' && store.devices.find(replaces) !== undefined) {
      store.devices.update(replaces, { hidden: false });
    }
  }

  relay(adverts: readonly BleAdvert[], heardBy: string): Promise<RelayOutcome> {
    const result = this.relaying.then(() => this.relayBatch(adverts, heardBy));
    this.relaying = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async relayBatch(adverts: readonly BleAdvert[], heardBy: string): Promise<RelayOutcome> {
    const entries = new Map(
      this.options.store.localDevices.list().map((entry) => [entry.address, entry]),
    );
    const readings = new Set<string>();
    let ignored = 0;
    let unknown = 0;
    for (const advert of adverts) {
      const entry = entries.get(advert.address);
      unknown += entry === undefined ? 1 : 0;
      const received: Received =
        entry === undefined ? { kind: 'ignored' } : await this.receive(entry, advert, heardBy);
      if (received.kind === 'ignored') {
        ignored += 1;
      } else if (received.kind === 'reading') {
        readings.add(received.id);
      }
    }
    await this.options.apply(this.discovered());
    const outcome = { accepted: adverts.length - ignored, ignored, readings: [...readings] };
    this.options.log.info('local.adverts_relayed', {
      heardBy,
      adverts: adverts.length,
      accepted: outcome.accepted,
      ignored,
      unknownAddress: unknown,
      readings: outcome.readings.length,
    });
    return outcome;
  }

  private async receive(
    entry: LocalDeviceEntry,
    advert: BleAdvert,
    heardBy: string,
  ): Promise<Received> {
    const key = this.options.secrets.deviceKey(entry.externalId);
    if (key === null) {
      this.options.log.error('local.key_missing', undefined, {
        externalId: entry.externalId,
        reason: 'no Bluetooth key is stored for this device; enable it again',
      });
      return { kind: 'ignored' };
    }
    const device = this.deviceOf(entry);
    const adverts = LOCAL_DRIVER_REGISTRY[entry.driver].adverts;
    if (device === undefined || adverts === null) {
      return { kind: 'ignored' };
    }
    try {
      const decoded = adverts.decode(entry, advert, key);
      if (decoded.kind === 'state') {
        return (await this.passive.receive(entry, advert, key, decoded))
          ? { kind: 'idle' }
          : { kind: 'ignored' };
      }
      this.remember(entry.externalId, { lastHeardAt: advert.seenAt });
      if (decoded.kind === 'idle') {
        return { kind: 'idle' };
      }
      return {
        kind: 'reading',
        id: this.options.readings.record({ ...decoded.measurement, deviceId: device.id }).id,
      };
    } catch (cause) {
      if (!UNREADABLE.some((kind) => cause instanceof kind)) {
        throw cause;
      }
      this.options.log.warn('local.advert_unreadable', {
        externalId: entry.externalId,
        heardBy,
        reason: failureLine(cause),
      });
      return { kind: 'ignored' };
    }
  }

  async observe(externalId: string, values: Readonly<Record<string, JsonValue>>): Promise<void> {
    this.remember(externalId, values);
    await this.options.apply(this.discovered());
  }

  deviceOf(entry: LocalDeviceEntry): DeviceRow | undefined {
    return this.options.store.devices
      .list()
      .find(
        (row) =>
          row.provider === LOCAL_DRIVER_REGISTRY[entry.driver].provider &&
          row.external_id === entry.externalId,
      );
  }

  private remember(externalId: string, values: Readonly<Record<string, JsonValue>>): void {
    const entry = this.options.store.localDevices.byExternalId(externalId);
    this.observed.set(externalId, { ...this.observedOf(entry), ...values });
  }

  private observedOf(entry: LocalDeviceEntry): Observed {
    return this.observed.get(entry.externalId) ?? this.deviceOf(entry)?.details ?? {};
  }

  private discovered(): DiscoveredDevice[] {
    return this.options.store.localDevices
      .list()
      .flatMap(
        (entry) =>
          LOCAL_DRIVER_REGISTRY[entry.driver].describe(entry, this.observedOf(entry)) ?? [],
      );
  }
}
