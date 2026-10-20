import type { DiscoveredDevice, JsonValue } from '@smarteverything/domain';
import type { CloudDevice } from './cloud-api';
import type { RejectedDataPoint } from './data-points';
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
  readonly smartLife: SmartLifeFacts;
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

function smartLifeDetails(facts: SmartLifeFacts): Readonly<Record<string, JsonValue>> {
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
