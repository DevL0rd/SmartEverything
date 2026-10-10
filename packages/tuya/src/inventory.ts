import type { DeviceCapability, DiscoveredDevice, JsonValue } from '@smarteverything/domain';
import type { CloudDevice, IrRemote, IrRemoteKeys } from './cloud-api';
import type { RejectedDataPoint } from './data-points';
import type { LibraryKey } from './ir-codes';
import type { DeviceModel } from './model';
import { IDENTITY_CONVERSION } from './conversions';
import type { SmartLifeFacts } from './smart-life-model';
import type { TransportChoice } from './transport';

export const MANUFACTURER = 'Tuya';

const BATTERY_CODES: ReadonlySet<string> = new Set([
  'battery_percentage',
  'battery_state',
  'battery_value',
  'va_battery',
]);

export interface InventoryEntry {
  readonly device: CloudDevice;
  readonly model: DeviceModel;
  readonly rejected: readonly RejectedDataPoint[];
  readonly specificationPublished: boolean;
  readonly room: string | null;
  readonly smartLife: SmartLifeFacts | null;
}

export function isSleepingSensor(model: DeviceModel): boolean {
  return model.kind === 'sensor' && model.points.some((point) => BATTERY_CODES.has(point.code));
}

function displayName(device: CloudDevice): string {
  const trimmed = device.name.trim();
  if (trimmed !== '') {
    return trimmed;
  }
  return device.product_name ?? device.id;
}

function smartLifeDetails(facts: SmartLifeFacts | null): Readonly<Record<string, JsonValue>> {
  if (facts === null) {
    return { link: 'developer_project' };
  }
  return {
    link: 'smart_life',
    cloudReports: facts.cloudReports,
    cloudReportReason: facts.cloudReportReason,
    gatewayFrom: facts.gatewayFrom,
    nodeIdFrom: facts.nodeIdFrom,
    convertedDataPoints: [...facts.conversions.values()].filter(
      (conversion) => conversion.name !== IDENTITY_CONVERSION,
    ).length,
  };
}

export function discoveredDevice(
  entry: InventoryEntry,
  choice: TransportChoice,
  protocolVersion: string | null,
): DiscoveredDevice {
  const { device, model } = entry;
  const rejected: JsonValue = entry.rejected.map((item) => ({
    code: item.code,
    reason: item.reason,
  }));
  return {
    provider: 'tuya',
    externalId: device.id,
    parentExternalId: device.sub ? device.gateway_id : null,
    kind: model.kind,
    name: displayName(device),
    model: device.model ?? device.product_id,
    manufacturer: MANUFACTURER,
    room: entry.room,
    online: device.online,
    capabilities: [...model.capabilities],
    details: {
      category: device.category,
      productId: device.product_id,
      transport: choice.transport,
      transportReason: choice.reason,
      protocolVersion,
      subDevice: device.sub,
      nodeId: device.node_id,
      specificationPublished: entry.specificationPublished,
      rejectedDataPoints: rejected,
      ...smartLifeDetails(entry.smartLife),
    },
  };
}

export function remoteKeyCapability(keys: IrRemoteKeys): DeviceCapability | null {
  const options = [...new Set(keys.key_list.map((item) => item.key))];
  if (options.length === 0) {
    return null;
  }
  return {
    key: 'remote_key',
    label: 'Remote button',
    access: 'write',
    value: { kind: 'enum', options },
  };
}

export function remoteDevice(
  blaster: CloudDevice,
  remote: IrRemote,
  keys: IrRemoteKeys,
  room: string | null,
): DiscoveredDevice {
  const capability = remoteKeyCapability(keys);
  return {
    provider: 'tuya',
    externalId: remote.remote_id,
    parentExternalId: blaster.id,
    kind: 'ir_remote',
    name: remote.remote_name,
    model: `ir-category-${String(remote.category_id)}`,
    manufacturer: remote.brand_name ?? MANUFACTURER,
    room,
    online: blaster.online,
    capabilities: capability === null ? [] : [capability],
    details: {
      categoryId: keys.category_id,
      transport: 'cloud',
      transportReason: 'cloud_library',
    },
  };
}

export class RemoteKeyError extends Error {
  override readonly name = 'RemoteKeyError';

  constructor(
    readonly remoteId: string,
    readonly key: string,
  ) {
    super(`The IR remote ${remoteId} has no button "${key}".`);
  }
}

export function libraryKeyOf(remoteId: string, keys: IrRemoteKeys, key: string): LibraryKey {
  const found = keys.key_list.find((item) => item.key === key);
  if (found === undefined) {
    throw new RemoteKeyError(remoteId, key);
  }
  return { remoteId, categoryId: keys.category_id, keyId: found.key_id, key: found.key };
}

export function libraryCommandBody(key: LibraryKey): string {
  return JSON.stringify({ category_id: key.categoryId, key_id: key.keyId, key: key.key });
}
