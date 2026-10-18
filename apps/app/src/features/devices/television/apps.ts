import {
  TV_APP_CATALOGUE,
  currentApp,
  type AppTone,
  type CommandRow,
  type CurrentApp,
  type TvAppEntry,
} from '@smarteverything/domain';
import type { Device } from '../../../store/state';
import { compareText } from '../../../format/text';

const FEATURED_APPS: readonly string[] = [
  'YouTube',
  'Netflix',
  'Prime Video',
  'Disney+',
  'Plex',
  'Spotify',
];

export const CARD_APP_COUNT = 4;

export const TONE_CLASS: Readonly<Record<AppTone, string>> = {
  'viz-1': 'bg-viz-1/25',
  'viz-2': 'bg-viz-2/25',
  'viz-3': 'bg-viz-3/25',
  'viz-4': 'bg-viz-4/25',
  'viz-5': 'bg-viz-5/25',
  'viz-6': 'bg-viz-6/25',
  'viz-7': 'bg-viz-blue/25',
  'viz-8': 'bg-viz-magenta/25',
};

export const GLOW_CLASS: Readonly<Record<AppTone, string>> = {
  'viz-1': 'from-viz-1/12',
  'viz-2': 'from-viz-2/12',
  'viz-3': 'from-viz-3/12',
  'viz-4': 'from-viz-4/12',
  'viz-5': 'from-viz-5/12',
  'viz-6': 'from-viz-6/12',
  'viz-7': 'from-viz-blue/12',
  'viz-8': 'from-viz-magenta/12',
};

export interface TvApp {
  readonly name: string;
  readonly tone: AppTone;
  readonly monogram: string;
}

function appOf(entry: TvAppEntry): TvApp | null {
  const id = entry.launchIds[0] ?? entry.packageIds[0];
  const known: CurrentApp | null = currentApp(id);
  return known === null ? null : { name: entry.name, tone: known.tone, monogram: known.monogram };
}

export function launchableApps(device: Device): readonly TvApp[] {
  const offered = device.capabilities.flatMap((capability) =>
    capability.key === 'app_launch' && capability.value.kind === 'enum'
      ? capability.value.options
      : [],
  );
  return TV_APP_CATALOGUE.filter((entry) => offered.includes(entry.name)).flatMap((entry) => {
    const app = appOf(entry);
    return app === null ? [] : [app];
  });
}

export type LaunchRecord = Pick<
  CommandRow,
  'device_id' | 'capability' | 'value' | 'status' | 'created_at'
>;

const RECENT_LIMIT = 8;

export function recentLaunches(rows: readonly LaunchRecord[], deviceId: string): readonly string[] {
  const names = rows
    .filter(
      (row) =>
        row.device_id === deviceId &&
        row.capability === 'app_launch' &&
        row.status !== 'failed' &&
        typeof row.value === 'string',
    )
    .sort((first, second) => compareText(second.created_at, first.created_at))
    .flatMap((row) => (typeof row.value === 'string' ? [row.value] : []));
  return [...new Set(names)].slice(0, RECENT_LIMIT);
}

export function featuredApps(
  all: readonly TvApp[],
  watching: string | null,
  recent: readonly string[],
  count: number,
): readonly TvApp[] {
  const named = (names: readonly string[]): readonly TvApp[] =>
    names.flatMap((name) => all.filter((app) => app.name === name));
  const current = named(watching === null ? [] : [watching]);
  const ordered = [...current, ...named(recent), ...named(FEATURED_APPS)];
  const seen = new Set<string>();
  return ordered
    .filter((app) => {
      const fresh = !seen.has(app.name);
      seen.add(app.name);
      return fresh;
    })
    .slice(0, count);
}
