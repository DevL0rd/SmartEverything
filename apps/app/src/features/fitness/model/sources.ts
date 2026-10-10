import {
  HEALTH_RECORD_TYPES,
  type HealthRecordType,
  type HealthSyncPref,
} from '@smarteverything/domain';
import { appName } from '../../../format/health-apps';
import { seriesOfType } from './catalogue';

export interface GrantSummary {
  readonly granted: readonly HealthRecordType[];
  readonly missing: readonly HealthRecordType[];
}

export function grantSummary(
  requested: readonly HealthRecordType[],
  granted: readonly HealthRecordType[],
): GrantSummary {
  const ordered = HEALTH_RECORD_TYPES.filter((type) => requested.includes(type));
  return {
    granted: ordered.filter((type) => granted.includes(type)),
    missing: ordered.filter((type) => !granted.includes(type)),
  };
}

export function typeLabel(type: HealthRecordType): string {
  return seriesOfType(type).label;
}

export interface SourceSighting {
  readonly sourceApp: string;
  readonly recordType: HealthRecordType;
}

export interface SourceApp {
  readonly name: string;
  readonly packages: readonly string[];
  readonly types: readonly HealthRecordType[];
}

export { appName };

export function appsOf(sightings: readonly SourceSighting[]): readonly SourceApp[] {
  const byName = new Map<string, { packages: Set<string>; types: Set<HealthRecordType> }>();
  for (const sighting of sightings) {
    const name = appName(sighting.sourceApp);
    const entry = byName.get(name) ?? { packages: new Set(), types: new Set() };
    entry.packages.add(sighting.sourceApp);
    entry.types.add(sighting.recordType);
    byName.set(name, entry);
  }
  return [...byName.entries()]
    .map(([name, entry]) => ({
      name,
      packages: [...entry.packages],
      types: HEALTH_RECORD_TYPES.filter((type) => entry.types.has(type)),
    }))
    .sort((left, right) => right.types.length - left.types.length);
}

export const SYNC_INTERVAL_OPTIONS: readonly { readonly value: string; readonly label: string }[] =
  [
    { value: '0', label: 'Off' },
    { value: '15', label: 'Every 15 minutes' },
    { value: '30', label: 'Every 30 minutes' },
    { value: '60', label: 'Every hour' },
  ];

export type SyncIntervalMinutes = HealthSyncPref['intervalMinutes'];

class UnknownSyncIntervalError extends RangeError {
  override readonly name = 'UnknownSyncIntervalError';

  constructor(readonly choice: string) {
    super(`${choice} is not a background sync interval.`);
  }
}

const INTERVALS: Readonly<Record<string, SyncIntervalMinutes>> = {
  '0': 0,
  '15': 15,
  '30': 30,
  '60': 60,
};

export function syncIntervalOf(choice: string): SyncIntervalMinutes {
  const minutes = INTERVALS[choice];
  if (minutes === undefined) {
    throw new UnknownSyncIntervalError(choice);
  }
  return minutes;
}
