import type { DiscoveredDevice, StateUpdate } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import {
  DEVICE,
  DEVICE_LIST,
  DEVICE_STATUS,
  LOCATION_LIST,
  mapDevice,
  nextPageOf,
  ROOM_LIST,
  statesForEvent,
  statesOf,
  withEvent,
  type Binding,
  type Device,
  type DeviceState,
  type SmartThingsDeviceEvent,
  type SubscribedDevice,
} from '@smarteverything/smartthings';
import type { DefinitionCache } from './definitions';
import type { SmartThingsApi } from './http';

const DEVICE_LIST_ACCEPT = 'application/vnd.smartthings+json;v=20170916';

const DEVICE_LIST_PATH = '/v1/devices?includeStatus=true&includeHealth=true';

export class UnknownDeviceError extends Error {
  override readonly name = 'UnknownDeviceError';

  constructor(readonly externalId: string) {
    super(`SmartThings has no discovered device ${externalId}; discover devices again.`);
  }
}

export interface RejectedDevice {
  readonly externalId: string | null;
  readonly cause: unknown;
}

interface InventoryEntry extends DeviceState {
  readonly device: DiscoveredDevice;
}

function sourcesOf(devices: readonly Device[]): readonly SubscribedDevice[] {
  return devices.map((device) => ({
    deviceId: device.deviceId,
    locationId: device.locationId,
    capabilities: device.components.flatMap((component) =>
      component.capabilities.map((capability) => capability.id),
    ),
  }));
}

export class Inventory {
  private readonly entries = new Map<string, InventoryEntry>();
  private sources: readonly SubscribedDevice[] = [];
  private loaded = false;

  constructor(
    private readonly api: SmartThingsApi,
    private readonly definitions: DefinitionCache,
    private readonly log: Logger,
  ) {}

  get subscriptionSources(): readonly SubscribedDevice[] {
    return this.sources;
  }

  get isLoaded(): boolean {
    return this.loaded;
  }

  async load(): Promise<{
    readonly devices: readonly DiscoveredDevice[];
    readonly rejected: readonly RejectedDevice[];
  }> {
    const locations = LOCATION_LIST.parse(
      await this.api.request({ method: 'GET', path: '/v1/locations' }),
    );
    const rooms = new Map<string, string>();
    for (const location of locations.items) {
      const list = ROOM_LIST.parse(
        await this.api.request({
          method: 'GET',
          path: `/v1/locations/${location.locationId}/rooms`,
        }),
      );
      list.items.forEach((room) => rooms.set(room.roomId, room.name));
    }
    const { devices, rejected } = await this.listDevices();
    const references = devices.flatMap((device) =>
      device.components.flatMap((component) =>
        component.capabilities.map((reference) => ({
          id: reference.id,
          version: reference.version ?? 1,
        })),
      ),
    );
    const definitions = await this.definitions.load(references);
    this.entries.clear();
    for (const device of devices) {
      try {
        const mapped = mapDevice(device, { rooms, definitions });
        this.entries.set(device.deviceId, { externalId: device.deviceId, ...mapped });
      } catch (cause) {
        rejected.push({ externalId: device.deviceId, cause });
      }
    }
    this.sources = sourcesOf(devices.filter((device) => this.entries.has(device.deviceId)));
    this.loaded = true;
    rejected.forEach((entry) => {
      this.log.warn('device.rejected', {
        externalId: entry.externalId,
        reason: String(entry.cause),
      });
    });
    return { devices: [...this.entries.values()].map((entry) => entry.device), rejected };
  }

  requireDevice(externalId: string): void {
    this.entryOf(externalId);
  }

  bindingFor(externalId: string, capability: string): Binding | undefined {
    return this.entryOf(externalId).bindings.find(
      (binding) => binding.capability.key === capability,
    );
  }

  currentStates(observedAt: string): readonly StateUpdate[] {
    return [...this.entries.values()].flatMap((entry) => statesOf(entry, observedAt));
  }

  replaceStatus(externalId: string, received: unknown, observedAt: string): readonly StateUpdate[] {
    const entry = this.entryOf(externalId);
    const status = DEVICE_STATUS.parse(received);
    const updated = { ...entry, status: status.components };
    this.entries.set(externalId, updated);
    return statesOf(updated, observedAt);
  }

  applyEvent(event: SmartThingsDeviceEvent, observedAt: string): readonly StateUpdate[] {
    const entry = this.entries.get(event.deviceId);
    if (entry === undefined) {
      return [];
    }
    const updated = { ...entry, status: withEvent(entry.status, event) };
    this.entries.set(event.deviceId, updated);
    return statesForEvent(updated, event, observedAt);
  }

  private entryOf(externalId: string): InventoryEntry {
    const entry = this.entries.get(externalId);
    if (entry === undefined) {
      throw new UnknownDeviceError(externalId);
    }
    return entry;
  }

  private async listDevices(): Promise<{ devices: Device[]; rejected: RejectedDevice[] }> {
    const devices: Device[] = [];
    const rejected: RejectedDevice[] = [];
    let path: string | null = DEVICE_LIST_PATH;
    while (path !== null) {
      const page = DEVICE_LIST.parse(
        await this.api.request({ method: 'GET', path, accept: DEVICE_LIST_ACCEPT }),
      );
      for (const item of page.items) {
        const parsed = DEVICE.safeParse(item);
        if (parsed.success) {
          devices.push(parsed.data);
        } else {
          rejected.push({ externalId: null, cause: parsed.error });
        }
      }
      path = nextPageOf(page);
    }
    return { devices, rejected };
  }
}
