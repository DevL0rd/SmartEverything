import type { DeviceCapability, DiscoveredDevice, JsonValue } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import {
  DEVICE_LIST_PATH,
  HOME_LIST_PATH,
  TEXT_MAX_LENGTH,
  cameraFeatures,
  describePtz,
  deviceListData,
  go2rtcSource,
  homeListData,
  isCameraModel,
  missUnreachable,
  modelFromSpec,
  parseDeviceList,
  parseRoomNames,
  ptzPlan,
  readingsSourceOf,
  type CloudDevice,
  type DeviceModel,
  type MiotSpec,
  type PtzPlan,
  type Transport,
} from '@smarteverything/xiaomi';
import { NO_MOTOR_ENDPOINT } from './camera-ptz';
import type { XiaomiCloud } from './cloud-api';
import type { SpecStore } from './spec-store';

export interface InventoryEntry {
  readonly cloud: CloudDevice;
  readonly room: string | null;
  readonly spec: MiotSpec | null;
  readonly model: DeviceModel;
  readonly specProblem: string | null;
  readonly ptz: PtzPlan | null;
}

export interface TransportState {
  readonly transport: Transport;
  readonly online: boolean;
  readonly reason: string;
  readonly updates: string;
  readonly pushSource: string | null;
  readonly pushSince: string | null;
}

const EMPTY_MODEL: DeviceModel = {
  kind: 'other',
  capabilities: [],
  bindings: new Map(),
  propertyKeys: new Map(),
  problems: [],
};

const CAMERA_STREAM: DeviceCapability = {
  key: 'camera_stream',
  label: 'Live view',
  access: 'read',
  value: { kind: 'text', maxLength: TEXT_MAX_LENGTH },
};

export interface InventorySources {
  readonly cloud: XiaomiCloud;
  readonly specs: SpecStore;
  readonly log: Logger;
  readonly cameraMotor: boolean;
}

const NO_STREAM = 'the camera has no LAN address, so go2rtc holds no stream for it';

function reachablePlan(plan: PtzPlan, device: CloudDevice, cameraMotor: boolean): PtzPlan {
  if (!cameraMotor) {
    return missUnreachable(plan, NO_MOTOR_ENDPOINT);
  }
  return device.ip === null ? missUnreachable(plan, NO_STREAM) : plan;
}

async function entryFor(
  device: CloudDevice,
  rooms: ReadonlyMap<string, string>,
  sources: InventorySources,
): Promise<InventoryEntry> {
  const { specs, log } = sources;
  const room = rooms.get(device.did) ?? null;
  try {
    const spec = await specs.specFor(device.model, device.specType);
    const model = modelFromSpec(spec);
    if (model.problems.length > 0) {
      log.debug('xiaomi_device.mapping_skipped', { model: device.model, problems: model.problems });
    }
    const ptz = isCameraModel(device.model)
      ? reachablePlan(ptzPlan(spec, device.model), device, sources.cameraMotor)
      : null;
    return { cloud: device, room, spec, model, specProblem: null, ptz };
  } catch (error) {
    log.warn('xiaomi_device.spec_unavailable', { model: device.model, reason: String(error) });
    return {
      cloud: device,
      room,
      spec: null,
      model: EMPTY_MODEL,
      specProblem: String(error),
      ptz: null,
    };
  }
}

export async function fetchInventory(sources: InventorySources): Promise<InventoryEntry[]> {
  const { cloud, log } = sources;
  const page = parseDeviceList(await cloud.call(DEVICE_LIST_PATH, deviceListData()));
  if (page.malformed > 0) {
    log.warn('xiaomi_inventory.devices_unreadable', { count: page.malformed });
  }
  const rooms = parseRoomNames(await cloud.call(HOME_LIST_PATH, homeListData()));
  const entries: InventoryEntry[] = [];
  for (const device of page.devices) {
    entries.push(await entryFor(device, rooms, sources));
  }
  return entries;
}

function cameraDetails(
  entry: InventoryEntry,
  account: { userId: string; region: XiaomiCloud['region'] },
): Record<string, JsonValue> {
  if (entry.spec === null || entry.ptz === null) {
    return {};
  }
  const features = cameraFeatures(entry.spec, entry.cloud.model);
  const source =
    entry.cloud.ip === null
      ? {}
      : {
          go2rtcSource: go2rtcSource({
            ...account,
            ip: entry.cloud.ip,
            did: entry.cloud.did,
            model: entry.cloud.model,
          }),
        };
  const ptz = features.physicalPtz ? { ptz: describePtz(entry.ptz) } : {};
  return {
    ...source,
    ...ptz,
    twoWayAudio: features.twoWayAudio,
    physicalPtz: features.physicalPtz,
  };
}

export function discoveredDevice(
  entry: InventoryEntry,
  transport: TransportState,
  account: { userId: string; region: XiaomiCloud['region'] },
  knownDids: ReadonlySet<string>,
): DiscoveredDevice {
  const camera = cameraDetails(entry, account);
  const readingsSource = entry.spec === null ? null : readingsSourceOf(entry.spec.type);
  const parent = entry.cloud.parentDid;
  return {
    provider: 'xiaomi',
    externalId: entry.cloud.did,
    parentExternalId: parent !== null && knownDids.has(parent) ? parent : null,
    kind: entry.spec === null && isCameraModel(entry.cloud.model) ? 'camera' : entry.model.kind,
    name: entry.cloud.name,
    model: entry.cloud.model,
    manufacturer: entry.cloud.model.split('.')[0] ?? entry.cloud.model,
    room: entry.room,
    online: transport.online,
    capabilities:
      'go2rtcSource' in camera
        ? [...entry.model.capabilities, CAMERA_STREAM]
        : [...entry.model.capabilities],
    details: {
      transport: transport.transport,
      transportReason: transport.reason,
      updates: transport.updates,
      pushSource: transport.pushSource,
      pushSince: transport.pushSince,
      ip: entry.cloud.ip,
      specType: entry.spec === null ? null : entry.spec.type,
      specProblem: entry.specProblem,
      unmappedSpecEntries: [...entry.model.problems],
      ...(readingsSource === null ? {} : { readingsSource }),
      ...camera,
    },
  };
}
