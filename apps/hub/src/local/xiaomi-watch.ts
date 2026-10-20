import {
  WATCH_CONFIG,
  WATCH_WORKOUT_CONTROLS,
  WATCH_WORKOUT_STATUSES,
  type DeviceCapability,
  type DiscoveredDevice,
  type JsonValue,
} from '@smarteverything/domain';
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

function choice(
  key: DeviceCapability['key'],
  label: string,
  access: DeviceCapability['access'],
  options: readonly string[],
): DeviceCapability {
  return { key, label, access, value: { kind: 'enum', options: [...options] } };
}

function capabilitiesOf(observed: Observed): DeviceCapability[] {
  const config = WATCH_CONFIG.safeParse(observed['config']);
  const sports = config.success ? config.data.sports : [];
  return [
    choice('watch_workout', 'Workout', 'read', WATCH_WORKOUT_STATUSES),
    ...(sports.length === 0
      ? []
      : [choice('watch_workout_start', 'Start workout', 'write', sports)]),
    choice('watch_workout_control', 'Workout control', 'write', WATCH_WORKOUT_CONTROLS),
  ];
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
    capabilities: capabilitiesOf(observed),
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
