import type { DeviceRow, LiveChange } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { Unsubscribe } from '../store/feed';
import type { LocalDeviceEntry } from '../store/repositories/local-devices';
import type { Store } from '../store/store';
import type { LocalSight } from './local-units';

class RosterEntryMissingError extends Error {
  override readonly name = 'RosterEntryMissingError';

  constructor(readonly externalId: string) {
    super(`The built-in device ${externalId} is not loaded on the hub.`);
  }
}

export interface RosterOptions {
  readonly store: Pick<Store, 'host' | 'feed'>;
  readonly accepts: (entry: LocalDeviceEntry) => boolean;
  readonly name: string;
}

export interface RosterListener {
  readonly added: (device: DeviceRow) => Promise<void>;
  readonly removed: (deviceId: string) => void;
}

export interface RosterLookup {
  readonly device: DeviceRow;
  readonly member: boolean;
}

export class FleetRoster {
  private readonly entries = new Map<string, LocalDeviceEntry>();
  private readonly devices = new Map<string, DeviceRow>();
  private readonly others = new Set<string>();
  private listener: RosterListener | null = null;

  constructor(private readonly options: RosterOptions) {}

  async load(): Promise<void> {
    this.absorb(await this.options.store.host.read('localSight', null));
  }

  follow(listener: RosterListener): Unsubscribe {
    this.listener = listener;
    const unsubscribe = this.options.store.feed.subscribe((change) => {
      this.changed(change);
    });
    return () => {
      this.listener = null;
      unsubscribe();
    };
  }

  has(externalId: string): boolean {
    return this.entries.has(externalId);
  }

  entryOf(externalId: string): LocalDeviceEntry {
    const entry = this.entries.get(externalId);
    if (entry === undefined) {
      throw new RosterEntryMissingError(externalId);
    }
    return entry;
  }

  use(entry: LocalDeviceEntry): void {
    this.entryOf(entry.externalId);
    this.entries.set(entry.externalId, entry);
  }

  device(deviceId: string): DeviceRow | undefined {
    return this.devices.get(deviceId);
  }

  deviceOfEntry(externalId: string): DeviceRow | undefined {
    return [...this.devices.values()].find((device) => device.external_id === externalId);
  }

  async lookup(deviceId: string): Promise<RosterLookup> {
    const known = this.devices.get(deviceId);
    if (known !== undefined) {
      return { device: known, member: true };
    }
    const device = await this.options.store.host.call('devices', 'byId', deviceId);
    if (device.provider !== 'local' || this.others.has(device.external_id)) {
      return { device, member: false };
    }
    await this.load();
    const loaded = this.devices.get(deviceId);
    return loaded === undefined ? { device, member: false } : { device: loaded, member: true };
  }

  async member(deviceId: string): Promise<DeviceRow | null> {
    const known = this.devices.get(deviceId);
    if (known !== undefined) {
      return known;
    }
    const device = await this.options.store.host.call('devices', 'find', deviceId);
    if (device?.provider !== 'local' || this.others.has(device.external_id)) {
      return null;
    }
    await this.load();
    return this.devices.get(deviceId) ?? null;
  }

  async deviceForEntry(externalId: string): Promise<DeviceRow | undefined> {
    const known = this.deviceOfEntry(externalId);
    if (known !== undefined) {
      return known;
    }
    await this.load();
    return this.deviceOfEntry(externalId);
  }

  members(): readonly { readonly entry: LocalDeviceEntry; readonly device: DeviceRow }[] {
    return [...this.devices.values()].flatMap((device) => {
      const entry = this.entries.get(device.external_id);
      return entry === undefined ? [] : [{ entry, device }];
    });
  }

  private absorb(sight: LocalSight): void {
    for (const entry of sight.entries) {
      if (!this.options.accepts(entry)) {
        this.others.add(entry.externalId);
        continue;
      }
      this.others.delete(entry.externalId);
      if (!this.entries.has(entry.externalId)) {
        this.entries.set(entry.externalId, entry);
      }
      const device = sight.devices[entry.externalId];
      if (device !== undefined && !this.devices.has(device.id)) {
        this.devices.set(device.id, device);
      }
    }
  }

  private changed(change: LiveChange): void {
    if (change.table !== 'devices') {
      return;
    }
    const { record, oldRecord } = change;
    if (record === null) {
      if (oldRecord !== null && this.devices.delete(oldRecord.id)) {
        this.entries.delete(oldRecord.external_id);
        this.listener?.removed(oldRecord.id);
      }
      return;
    }
    if (record.provider !== 'local' || this.others.has(record.external_id)) {
      return;
    }
    if (this.entries.has(record.external_id)) {
      const known = this.devices.has(record.id);
      this.devices.set(record.id, record);
      if (!known) {
        this.announce(record);
      }
      return;
    }
    background(this.discover(record), `${this.options.name}.roster_load_failed`, {
      device: record.id,
    });
  }

  private async discover(record: DeviceRow): Promise<void> {
    await this.load();
    if (this.entries.has(record.external_id) && this.devices.has(record.id)) {
      this.announce(record);
    }
  }

  private announce(device: DeviceRow): void {
    const { listener } = this;
    if (listener !== null) {
      background(listener.added(device), `${this.options.name}.roster_add_failed`, {
        device: device.id,
      });
    }
  }
}
