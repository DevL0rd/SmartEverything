import type {
  AdGuardSnapshot,
  CapabilityKey,
  DeviceCapability,
  DiscoveredDevice,
  JsonValue,
} from '@smarteverything/domain';
import type { DeviceMirrorSpec } from '../device-mirror';

export const ADGUARD_DRIVER_ID = 'adguard';
export const ADGUARD_EXTERNAL_ID = `${ADGUARD_DRIVER_ID}:primary`;

const ADGUARD_CAPABILITIES: readonly DeviceCapability[] = [
  { key: 'dns_protection', label: 'Ad blocking', access: 'read_write', value: { kind: 'boolean' } },
  {
    key: 'dns_blocked_percent',
    label: 'Blocked lookups',
    access: 'read',
    value: { kind: 'number', min: 0, max: 100, step: 0.1, unit: '%' },
  },
  {
    key: 'dns_queries',
    label: 'Lookups',
    access: 'read',
    value: { kind: 'number', min: 0, max: 1e12, step: 1 },
  },
];

function describeAdGuard(snapshot: AdGuardSnapshot): DiscoveredDevice | null {
  if (snapshot.url === null) {
    return null;
  }
  const version = snapshot.status?.version ?? null;
  return {
    provider: 'local',
    externalId: ADGUARD_EXTERNAL_ID,
    parentExternalId: null,
    kind: 'dns_filter',
    name: 'AdGuard Home',
    model: version === null ? 'AdGuard Home' : `AdGuard Home ${version}`,
    manufacturer: 'AdGuard',
    room: null,
    online: snapshot.connection.state === 'online',
    capabilities: [...ADGUARD_CAPABILITIES],
    details: { address: snapshot.url },
  };
}

function adguardReadings(snapshot: AdGuardSnapshot): ReadonlyMap<CapabilityKey, JsonValue> | null {
  const { status, stats } = snapshot;
  if (snapshot.connection.state !== 'online' || status === null) {
    return null;
  }
  const readings = new Map<CapabilityKey, JsonValue>([['dns_protection', status.protection]]);
  if (stats !== null) {
    readings.set('dns_blocked_percent', stats.blockedPercent);
    readings.set('dns_queries', stats.queries);
  }
  return readings;
}

export const ADGUARD_MIRROR: DeviceMirrorSpec<AdGuardSnapshot> = {
  externalId: ADGUARD_EXTERNAL_ID,
  describe: describeAdGuard,
  readings: adguardReadings,
  observedAt: (snapshot) => snapshot.at,
  sampled: null,
};
