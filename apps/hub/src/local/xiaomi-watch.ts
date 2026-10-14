import type { DiscoveredDevice, JsonValue } from '@smarteverything/domain';
import type { LocalDeviceEntry } from '../store/repositories/local-devices';
import type { LocalDriverDefinition, Observed } from './driver-types';

const STATE_KEYS = [
  'phase',
  'battery',
  'charging',
  'worn',
  'firmware',
  'steps',
  'heartRate',
  'lastSyncAt',
  'error',
  'reportedAt',
  'reportedBy',
  'config',
] as const;

function textOf(value: JsonValue | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

function stateOf(observed: Observed): Record<string, JsonValue> {
  return Object.fromEntries(STATE_KEYS.map((key) => [key, observed[key] ?? null]));
}

function describe(entry: LocalDeviceEntry, observed: Observed): DiscoveredDevice {
  return {
    provider: 'local',
    externalId: entry.externalId,
    parentExternalId: null,
    kind: 'other',
    name: entry.name,
    model: textOf(entry.config['model']) ?? 'miwear.watch',
    manufacturer: 'xiaomi',
    room: null,
    online: observed['phase'] !== 'failed',
    capabilities: [],
    details: {
      transport: 'bluetooth',
      driver: entry.driver,
      family: entry.config['family'] ?? null,
      address: entry.address,
      profileId: entry.config['profileId'] ?? null,
      updates: 'The phone of the watch’s person connects to it over Bluetooth and reports here',
      replaces: entry.config['replaces'] ?? null,
      ...stateOf(observed),
    },
  };
}

export const xiaomiWatchDriver: LocalDriverDefinition = {
  id: 'xiaomi_watch',
  provider: 'local',
  describe,
  adverts: null,
};
