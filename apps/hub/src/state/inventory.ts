import type { DiscoveredDevice, Provider } from '@smarteverything/domain';
import type { CameraUpsert, DeviceRecord, DeviceUpsert, HubDatabase } from '../database/port';

export type InventoryStore = Pick<
  HubDatabase,
  | 'loadDevices'
  | 'upsertDevices'
  | 'setDevicesOnline'
  | 'removeDevices'
  | 'ensureRooms'
  | 'upsertCameras'
>;

export interface OnlineChange {
  readonly device: DeviceRecord;
  readonly online: boolean;
}

export interface InventoryListener {
  readonly onlineChanged: (change: OnlineChange) => void;
  readonly devicesChanged: (devices: readonly DeviceRecord[]) => void;
}

class ProviderMismatchError extends Error {
  override readonly name = 'ProviderMismatchError';

  constructor(expected: Provider, received: Provider, externalId: string) {
    super(
      `The ${expected} adapter reported device ${externalId} as a ${received} device; every device it reports must be a ${expected} device.`,
    );
  }
}

class InvalidCameraSourceError extends Error {
  override readonly name = 'InvalidCameraSourceError';

  constructor(externalId: string, received: unknown) {
    super(
      `Camera ${externalId} has no usable go2rtc source; expected a URL with a scheme, received ${JSON.stringify(received)}.`,
    );
  }
}

function keyOf(provider: Provider, externalId: string): string {
  return `${provider}|${externalId}`;
}

export function cameraSourceOf(device: Pick<DeviceRecord, 'details'>): string | null {
  const source = device.details['go2rtcSource'];
  return typeof source === 'string' ? source : null;
}

export function pushSourceOf(device: Pick<DeviceRecord, 'details'>): string | null {
  const source = device.details['pushSource'];
  return typeof source === 'string' ? source : null;
}

function cameraRow(device: DeviceRecord): CameraUpsert | null {
  const source = cameraSourceOf(device);
  if (source === null) {
    return null;
  }
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(source)?.[1];
  if (scheme === undefined) {
    throw new InvalidCameraSourceError(device.externalId, source);
  }
  return {
    deviceId: device.id,
    streamName: device.id,
    sourceUrlKind: scheme.toLowerCase(),
    physicalPtz: device.details['physicalPtz'] === true,
    twoWayAudio: device.details['twoWayAudio'] === true,
  };
}

export class Inventory {
  private readonly byId = new Map<string, DeviceRecord>();
  private readonly byKey = new Map<string, DeviceRecord>();

  constructor(
    private readonly store: InventoryStore,
    private readonly listener: InventoryListener,
  ) {}

  async load(): Promise<void> {
    this.remember(await this.store.loadDevices());
  }

  deviceById(id: string): DeviceRecord | undefined {
    return this.byId.get(id);
  }

  deviceOf(provider: Provider, externalId: string): DeviceRecord | undefined {
    return this.byKey.get(keyOf(provider, externalId));
  }

  devicesOf(provider: Provider): readonly DeviceRecord[] {
    return [...this.byId.values()].filter((device) => device.provider === provider);
  }

  all(): readonly DeviceRecord[] {
    return [...this.byId.values()];
  }

  async apply(
    provider: Provider,
    discovered: readonly DiscoveredDevice[],
  ): Promise<readonly DeviceRecord[]> {
    for (const device of discovered) {
      if (device.provider !== provider) {
        throw new ProviderMismatchError(provider, device.provider, device.externalId);
      }
    }
    const before = new Map(
      discovered.map((device) => [device.externalId, this.deviceOf(provider, device.externalId)]),
    );
    const rooms = await this.store.ensureRooms(this.unplacedRoomNames(provider, discovered));
    const rows = (): DeviceUpsert[] => discovered.map((device) => this.upsertOf(device, rooms));
    const first = rows();
    this.remember(await this.store.upsertDevices(first));
    const second = rows().filter((row, index) => row.parentId !== first[index]?.parentId);
    const saved = [...(await this.store.upsertDevices(second))];
    this.remember(saved);
    const records = discovered.flatMap(
      (device) => this.deviceOf(provider, device.externalId) ?? [],
    );
    await this.store.upsertCameras(records.flatMap((device) => cameraRow(device) ?? []));
    this.announce(records, before);
    return records;
  }

  async remove(provider: Provider, externalIds: readonly string[]): Promise<void> {
    const devices = externalIds.flatMap((externalId) => this.deviceOf(provider, externalId) ?? []);
    await this.store.removeDevices(devices.map((device) => device.id));
    for (const device of devices) {
      this.byId.delete(device.id);
      this.byKey.delete(keyOf(provider, device.externalId));
    }
    this.listener.devicesChanged([]);
  }

  async setOnline(provider: Provider, externalId: string, online: boolean): Promise<void> {
    const device = this.deviceOf(provider, externalId);
    if (device === undefined || device.online === online) {
      return;
    }
    const saved = await this.store.setDevicesOnline([device.id], online);
    if (this.deviceOf(provider, externalId)?.online === online) {
      return;
    }
    this.remember(saved);
    this.announce(saved, new Map([[externalId, device]]));
  }

  async markOffline(provider: Provider): Promise<void> {
    const devices = this.devicesOf(provider).filter((device) => device.online);
    if (devices.length === 0) {
      return;
    }
    const before = new Map(devices.map((device) => [device.externalId, device]));
    const saved = await this.store.setDevicesOnline(
      devices.map((device) => device.id),
      false,
    );
    this.remember(saved);
    this.announce(saved, before);
  }

  private announce(
    records: readonly DeviceRecord[],
    before: ReadonlyMap<string, DeviceRecord | undefined>,
  ): void {
    for (const device of records) {
      const previous = before.get(device.externalId);
      if (previous !== undefined && previous.online !== device.online) {
        this.listener.onlineChanged({ device, online: device.online });
      }
    }
    this.listener.devicesChanged(records);
  }

  private unplacedRoomNames(provider: Provider, discovered: readonly DiscoveredDevice[]): string[] {
    const names = discovered
      .filter((device) => (this.deviceOf(provider, device.externalId)?.roomId ?? null) === null)
      .flatMap((device) => (device.room === null ? [] : [device.room]));
    return [...new Set(names)];
  }

  private upsertOf(device: DiscoveredDevice, rooms: ReadonlyMap<string, string>): DeviceUpsert {
    const parent =
      device.parentExternalId === null
        ? undefined
        : this.deviceOf(device.provider, device.parentExternalId);
    return {
      provider: device.provider,
      externalId: device.externalId,
      parentId: parent?.id ?? null,
      kind: device.kind,
      name: device.name,
      model: device.model,
      manufacturer: device.manufacturer,
      providerRoom: device.room,
      roomId: device.room === null ? null : (rooms.get(device.room) ?? null),
      online: device.online,
      capabilities: device.capabilities,
      details: device.details,
    };
  }

  private remember(devices: readonly DeviceRecord[]): void {
    for (const device of devices) {
      this.byId.set(device.id, device);
      this.byKey.set(keyOf(device.provider, device.externalId), device);
    }
  }
}
