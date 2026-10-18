import type {
  CapabilityKey,
  DeviceCapability,
  DiscoveredDevice,
  JsonValue,
  RouterSnapshot,
} from '@smarteverything/domain';
import type { PluginMetrics } from '../contract';
import type { DeviceMirrorSpec } from '../device-mirror';

export const ROUTER_DRIVER_ID = 'router';
export const ROUTER_EXTERNAL_ID = `${ROUTER_DRIVER_ID}:primary`;

const PERCENT = { kind: 'number', min: 0, max: 100, step: 0.1, unit: '%' } as const;
const RATE = { kind: 'number', min: 0, max: 1e10, step: 1, unit: 'B/s' } as const;

const ROUTER_CAPABILITIES: readonly DeviceCapability[] = [
  { key: 'wan_connected', label: 'Internet', access: 'read', value: { kind: 'boolean' } },
  { key: 'download_rate', label: 'Download', access: 'read', value: RATE },
  { key: 'upload_rate', label: 'Upload', access: 'read', value: RATE },
  {
    key: 'latency',
    label: 'Latency',
    access: 'read',
    value: { kind: 'number', min: 0, max: 10000, step: 0.1, unit: 'ms' },
  },
  { key: 'packet_loss', label: 'Packet loss', access: 'read', value: PERCENT },
  {
    key: 'network_clients',
    label: 'Devices online',
    access: 'read',
    value: { kind: 'number', min: 0, max: 1000, step: 1 },
  },
  { key: 'cpu_load', label: 'Router CPU', access: 'read', value: PERCENT },
  { key: 'memory_used', label: 'Router memory', access: 'read', value: PERCENT },
  {
    key: 'temperature',
    label: 'Temperature',
    access: 'read',
    value: { kind: 'number', min: -20, max: 150, step: 0.1, unit: '°C' },
  },
];

function describeRouter(snapshot: RouterSnapshot): DiscoveredDevice {
  return {
    provider: 'local',
    externalId: ROUTER_EXTERNAL_ID,
    parentExternalId: null,
    kind: 'router',
    name: 'Router',
    model: snapshot.info?.model ?? 'Asuswrt-Merlin router',
    manufacturer: 'ASUS',
    room: null,
    online: snapshot.connection.state === 'online',
    capabilities: [...ROUTER_CAPABILITIES],
    details: { firmware: snapshot.info?.firmware ?? null, lanIp: snapshot.info?.lanIp ?? null },
  };
}

type Reading = readonly [CapabilityKey, JsonValue | undefined];

function routerReadings(snapshot: RouterSnapshot): ReadonlyMap<CapabilityKey, JsonValue> {
  const entries: Reading[] = [
    ...networkReadings(snapshot.network),
    ...systemReadings(snapshot.system),
    ['network_clients', snapshot.clients.filter((client) => client.connected).length],
  ];
  return new Map(
    entries.flatMap(([key, value]): [CapabilityKey, JsonValue][] =>
      value === undefined || value === null ? [] : [[key, value]],
    ),
  );
}

function networkReadings(network: RouterSnapshot['network']): Reading[] {
  if (network === null) {
    return [];
  }
  return [
    ['wan_connected', network.wanUp],
    ['download_rate', Math.round((network.downloadMbps * 1e6) / 8)],
    ['upload_rate', Math.round((network.uploadMbps * 1e6) / 8)],
    ['latency', network.latencyMs],
    ['packet_loss', network.packetLossPercent],
  ];
}

function systemReadings(system: RouterSnapshot['system']): Reading[] {
  if (system === null) {
    return [];
  }
  return [
    ['cpu_load', system.cpuPercent],
    ['memory_used', system.memoryUsedPercent],
    ['temperature', system.temperatureCelsius],
  ];
}

const SAMPLED: ReadonlySet<CapabilityKey> = new Set([
  'download_rate',
  'upload_rate',
  'cpu_load',
  'memory_used',
  'latency',
  'temperature',
]);

export function routerMirror(metrics: PluginMetrics): DeviceMirrorSpec<RouterSnapshot> {
  return {
    externalId: ROUTER_EXTERNAL_ID,
    describe: (snapshot) =>
      snapshot.connection.state === 'not_set_up' ? null : describeRouter(snapshot),
    readings: (snapshot) =>
      snapshot.connection.state === 'online' ? routerReadings(snapshot) : null,
    observedAt: (snapshot) => snapshot.at,
    sampled: { keys: SAMPLED, metrics, stateEveryMs: 10_000 },
  };
}
