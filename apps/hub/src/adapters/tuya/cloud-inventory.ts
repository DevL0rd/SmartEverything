import type { Logger } from '@smarteverything/logging';
import {
  CLOUD_PATHS,
  DEVICE_PAGE,
  HOMES,
  IR_REMOTES,
  IR_REMOTE_KEYS,
  ROOMS,
  ROOM_DEVICES,
  SPECIFICATION,
  TuyaCloudError,
  dataPointsOf,
  deviceListQuery,
  kindOf,
  type CloudDevice,
  type DataPoint,
  type IrRemote,
  type IrRemoteKeys,
  type RejectedDataPoint,
  type SmartLifeFacts,
} from '@smarteverything/tuya';
import type { z } from 'zod';
import type { TuyaCloud } from './cloud-client';

export interface LoadedDevice {
  readonly cloud: CloudDevice;
  readonly points: readonly DataPoint[];
  readonly rejected: readonly RejectedDataPoint[];
  readonly specificationPublished: boolean;
  readonly room: string | null;
  readonly smartLife: SmartLifeFacts | null;
}

export interface LoadedRemote {
  readonly blaster: CloudDevice;
  readonly remote: IrRemote;
  readonly keys: IrRemoteKeys;
  readonly room: string | null;
}

export interface LoadedInventory {
  readonly devices: readonly LoadedDevice[];
  readonly remotes: readonly LoadedRemote[];
}

class DevicePagingError extends Error {
  override readonly name = 'DevicePagingError';

  constructor() {
    super('Tuya cloud said more devices follow but gave no cursor to fetch them with.');
  }
}

export async function listDevices(
  cloud: TuyaCloud,
  userId: string,
  deviceIds: readonly string[] = [],
): Promise<readonly CloudDevice[]> {
  const devices: CloudDevice[] = [];
  let cursor: string | null = null;
  for (;;) {
    const query: Readonly<Record<string, string>> = {
      ...deviceListQuery(userId, cursor),
      ...(deviceIds.length === 0 ? {} : { device_ids: deviceIds.join(',') }),
    };
    const page: z.output<typeof DEVICE_PAGE> = await cloud.call(
      'listing the app user devices',
      { method: 'GET', path: CLOUD_PATHS.devices, query },
      DEVICE_PAGE,
    );
    devices.push(...page.list);
    if (!page.has_more) {
      return devices;
    }
    if (page.last_row_key === null) {
      throw new DevicePagingError();
    }
    cursor = page.last_row_key;
  }
}

interface LoadedSpecification {
  readonly points: readonly DataPoint[];
  readonly rejected: readonly RejectedDataPoint[];
  readonly specificationPublished: boolean;
}

async function specificationOf(
  cloud: TuyaCloud,
  device: CloudDevice,
  log: Logger,
): Promise<LoadedSpecification> {
  try {
    const specification = await cloud.call(
      `reading the specification of ${device.id}`,
      { method: 'GET', path: CLOUD_PATHS.specification(device.id) },
      SPECIFICATION,
    );
    return { ...dataPointsOf(specification), specificationPublished: true };
  } catch (error) {
    if (error instanceof TuyaCloudError && error.kind === 'unsupported_device') {
      log.info('tuya.specification_unpublished', {
        deviceId: device.id,
        category: device.category,
      });
      return { points: [], rejected: [], specificationPublished: false };
    }
    throw error;
  }
}

async function homeRooms(
  cloud: TuyaCloud,
  homeId: string,
  rooms: Map<string, string>,
): Promise<void> {
  const listed = await cloud.call(
    `listing the rooms of home ${homeId}`,
    { method: 'GET', path: CLOUD_PATHS.rooms(homeId) },
    ROOMS,
  );
  for (const room of listed.rooms) {
    const members = await cloud.call(
      `listing the devices in room ${room.room_id}`,
      { method: 'GET', path: CLOUD_PATHS.roomDevices(homeId, room.room_id) },
      ROOM_DEVICES,
    );
    for (const member of members) {
      rooms.set(member.id, room.name);
    }
  }
}

async function roomsOf(
  cloud: TuyaCloud,
  userId: string,
  log: Logger,
): Promise<ReadonlyMap<string, string>> {
  const rooms = new Map<string, string>();
  try {
    const homes = await cloud.call(
      'listing the app user homes',
      { method: 'GET', path: CLOUD_PATHS.homes(userId) },
      HOMES,
    );
    for (const home of homes) {
      await homeRooms(cloud, home.home_id, rooms);
    }
  } catch (error) {
    if (!(error instanceof TuyaCloudError) || error.kind !== 'permission') {
      throw error;
    }
    log.warn('tuya.rooms_unavailable', { code: error.code, detail: error.detail });
  }
  return rooms;
}

async function remotesOf(
  cloud: TuyaCloud,
  blaster: CloudDevice,
  room: string | null,
  log: Logger,
): Promise<LoadedRemote[]> {
  try {
    const remotes = await cloud.call(
      `listing the IR remotes of ${blaster.id}`,
      { method: 'GET', path: CLOUD_PATHS.irRemotes(blaster.id) },
      IR_REMOTES,
    );
    const loaded: LoadedRemote[] = [];
    for (const remote of remotes) {
      const keys = await cloud.call(
        `listing the keys of IR remote ${remote.remote_id}`,
        { method: 'GET', path: CLOUD_PATHS.irKeys(blaster.id, remote.remote_id) },
        IR_REMOTE_KEYS,
      );
      loaded.push({ blaster, remote, keys, room });
    }
    return loaded;
  } catch (error) {
    if (!(error instanceof TuyaCloudError) || error.kind !== 'permission') {
      throw error;
    }
    log.warn('tuya.ir_library_unavailable', {
      deviceId: blaster.id,
      code: error.code,
      detail: error.detail,
    });
    return [];
  }
}

export async function loadInventory(
  cloud: TuyaCloud,
  userId: string,
  log: Logger,
): Promise<LoadedInventory> {
  const cloudDevices = await listDevices(cloud, userId);
  const rooms = await roomsOf(cloud, userId, log);
  const remotes: LoadedRemote[] = [];
  for (const blaster of cloudDevices.filter((device) => kindOf(device.category) === 'ir_blaster')) {
    remotes.push(...(await remotesOf(cloud, blaster, rooms.get(blaster.id) ?? null, log)));
  }
  const remoteIds = new Set(remotes.map((loaded) => loaded.remote.remote_id));
  const devices: LoadedDevice[] = [];
  for (const cloudDevice of cloudDevices.filter((device) => !remoteIds.has(device.id))) {
    const specification = await specificationOf(cloud, cloudDevice, log);
    devices.push({
      cloud: cloudDevice,
      ...specification,
      room: rooms.get(cloudDevice.id) ?? null,
      smartLife: null,
    });
  }
  return {
    devices,
    remotes: remotes.map((loaded) => ({
      ...loaded,
      room: rooms.get(loaded.remote.remote_id) ?? loaded.room,
    })),
  };
}
