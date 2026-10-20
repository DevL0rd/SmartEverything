import type { Logger } from '@smarteverything/logging';
import {
  CUSTOM_TYPE,
  DATA_POINT_RELATIONS,
  IR_REMOTE_CATEGORY_PREFIX,
  SMART_LIFE_DEVICES,
  SMART_LIFE_HOMES,
  SMART_LIFE_PATHS,
  SMART_LIFE_ROOM,
  SMART_LIFE_SPECIFICATION,
  TuyaCloudError,
  dataPointsOf,
  smartLifeModel,
  type CloudDevice,
  type DataPoint,
  type GatewaySource,
  type NodeIdSource,
  type RejectedDataPoint,
  type SmartLifeDevice,
  type SmartLifeFacts,
} from '@smarteverything/tuya';
import { mapBounded, type LoadOnce } from './bounded';
import type { SmartLifeCloud } from './smart-life-cloud';

type SmartLifeCalls = Pick<SmartLifeCloud, 'call'>;

export const CLOUD_CONCURRENCY = 4;

export interface LoadedDevice {
  readonly cloud: CloudDevice;
  readonly points: readonly DataPoint[];
  readonly rejected: readonly RejectedDataPoint[];
  readonly specificationPublished: boolean;
  readonly room: string | null;
  readonly smartLife: SmartLifeFacts;
}

export interface SmartLifeInventory {
  readonly devices: readonly LoadedDevice[];
  readonly owners: readonly string[];
  readonly reportsDataPoints: ReadonlyMap<string, boolean>;
}

interface Addressed {
  readonly device: SmartLifeDevice;
  readonly gatewayFrom: GatewaySource | null;
  readonly nodeIdFrom: NodeIdSource | null;
}

export async function homeDevices(
  cloud: SmartLifeCalls,
): Promise<{ owners: readonly string[]; devices: readonly SmartLifeDevice[] }> {
  const homes = await cloud.call(
    'listing the Smart Life homes',
    { method: 'GET', path: SMART_LIFE_PATHS.homes },
    SMART_LIFE_HOMES,
  );
  const devices: SmartLifeDevice[] = [];
  for (const home of homes) {
    devices.push(
      ...(await cloud.call(
        `listing the devices in home ${home.name}`,
        { method: 'GET', path: SMART_LIFE_PATHS.homeDevices, query: { homeId: home.ownerId } },
        SMART_LIFE_DEVICES,
      )),
    );
  }
  return { owners: homes.map((home) => home.ownerId), devices };
}

export function deviceDetails(
  cloud: SmartLifeCalls,
  deviceIds: readonly string[],
): Promise<readonly SmartLifeDevice[]> {
  return cloud.call(
    'reading Smart Life device details',
    {
      method: 'GET',
      path: SMART_LIFE_PATHS.deviceDetails,
      query: { devIds: deviceIds.join(',') },
    },
    SMART_LIFE_DEVICES,
  );
}

function gatewayOf(
  device: SmartLifeDevice,
  devices: readonly SmartLifeDevice[],
  log: Logger,
): Pick<Addressed, 'gatewayFrom'> & { readonly gatewayId: string | null } {
  if (device.gateway_id !== null) {
    return { gatewayId: device.gateway_id, gatewayFrom: 'device_list' };
  }
  const sharing = devices.filter(
    (candidate) =>
      !candidate.sub && candidate.local_key !== null && candidate.local_key === device.local_key,
  );
  const [gateway] = sharing;
  if (sharing.length === 1 && gateway !== undefined) {
    log.info('tuya.gateway_inferred', { deviceId: device.id, gatewayId: gateway.id });
    return { gatewayId: gateway.id, gatewayFrom: 'shared_local_key' };
  }
  log.warn('tuya.gateway_unknown', { deviceId: device.id, candidates: sharing.length });
  return { gatewayId: null, gatewayFrom: null };
}

function nodeIdSource(device: SmartLifeDevice): NodeIdSource | null {
  if (device.node_id !== null) {
    return 'device_list';
  }
  return device.uuid === null ? null : 'uuid';
}

function addressed(
  device: SmartLifeDevice,
  devices: readonly SmartLifeDevice[],
  log: Logger,
): Addressed {
  if (!device.sub) {
    return { device, gatewayFrom: null, nodeIdFrom: null };
  }
  const { gatewayId, gatewayFrom } = gatewayOf(device, devices, log);
  return {
    device: { ...device, gateway_id: gatewayId, node_id: device.node_id ?? device.uuid },
    gatewayFrom,
    nodeIdFrom: nodeIdSource(device),
  };
}

export type DescribedDevice = Omit<
  LoadedDevice,
  'cloud' | 'room' | 'specificationPublished' | 'smartLife'
> & {
  readonly facts: Omit<SmartLifeFacts, 'gatewayFrom' | 'nodeIdFrom'>;
};

type Descriptions = LoadOnce<DescribedDevice>;

async function described(cloud: SmartLifeCalls, deviceId: string): Promise<DescribedDevice> {
  const specification = await cloud.call(
    `reading the specification of ${deviceId}`,
    { method: 'GET', path: SMART_LIFE_PATHS.specification(deviceId) },
    SMART_LIFE_SPECIFICATION,
  );
  const relations = await cloud.call(
    `reading the data points of ${deviceId}`,
    { method: 'GET', path: SMART_LIFE_PATHS.dataPointRelations(deviceId) },
    DATA_POINT_RELATIONS,
  );
  const customType = await cloud.call(
    `reading the code type of ${deviceId}`,
    { method: 'GET', path: SMART_LIFE_PATHS.customType(deviceId) },
    CUSTOM_TYPE,
  );
  const model = smartLifeModel(specification, relations, customType);
  const points = dataPointsOf(model.sources);
  return {
    points: points.points,
    rejected: [...points.rejected, ...model.rejected],
    facts: {
      conversions: model.conversions,
      cloudReports: model.cloudReports,
      cloudReportReason: model.cloudReportReason,
    },
  };
}

function withoutSpecification(
  entry: Addressed,
  room: string | null,
  error: TuyaCloudError,
  log: Logger,
): LoadedDevice {
  const { device, gatewayFrom, nodeIdFrom } = entry;
  log.warn('tuya.specification_unpublished', {
    deviceId: device.id,
    category: device.category,
    code: error.code,
    detail: error.detail,
  });
  return {
    cloud: device,
    points: [],
    rejected: [],
    specificationPublished: false,
    room,
    smartLife: {
      conversions: new Map(),
      cloudReports: 'codes',
      cloudReportReason: 'specification_unpublished',
      gatewayFrom,
      nodeIdFrom,
    },
  };
}

async function loaded(
  cloud: SmartLifeCalls,
  entry: Addressed,
  log: Logger,
  descriptions: Descriptions,
): Promise<LoadedDevice> {
  const { device, gatewayFrom, nodeIdFrom } = entry;
  const room = await cloud.call(
    `reading the room of ${device.id}`,
    { method: 'GET', path: SMART_LIFE_PATHS.room(device.id) },
    SMART_LIFE_ROOM,
  );
  try {
    const { facts, ...model } = await descriptions.get(`${device.id}/${device.product_id}`, () =>
      described(cloud, device.id),
    );
    log.info('tuya.cloud_reports', {
      deviceId: device.id,
      reports: facts.cloudReports,
      reason: facts.cloudReportReason,
    });
    return {
      cloud: device,
      ...model,
      specificationPublished: true,
      room,
      smartLife: { ...facts, gatewayFrom, nodeIdFrom },
    };
  } catch (error) {
    if (!(error instanceof TuyaCloudError)) {
      throw error;
    }
    return withoutSpecification(entry, room, error, log);
  }
}

export async function loadSmartLifeInventory(
  cloud: SmartLifeCalls,
  log: Logger,
  descriptions: Descriptions,
): Promise<SmartLifeInventory> {
  const { owners, devices } = await homeDevices(cloud);
  const entries: Addressed[] = [];
  for (const device of devices) {
    if (device.category.startsWith(IR_REMOTE_CATEGORY_PREFIX)) {
      log.info('tuya.ir_library_remote_skipped', {
        deviceId: device.id,
        reason: 'virtual remotes of the Smart Life app are not controllable; blasters learn codes',
      });
    } else {
      entries.push(addressed(device, devices, log));
    }
  }
  const devicesLoaded = await mapBounded(entries, CLOUD_CONCURRENCY, (entry) =>
    loaded(cloud, entry, log, descriptions),
  );
  return {
    devices: devicesLoaded,
    owners,
    reportsDataPoints: new Map(
      devicesLoaded.map((entry) => [
        entry.cloud.id,
        entry.smartLife.cloudReports === 'data_points',
      ]),
    ),
  };
}
