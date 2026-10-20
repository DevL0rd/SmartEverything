import {
  type BottleDrinkRow,
  type BottleReadingRow,
  type DeviceRow,
  type WatchBridge,
} from '@smarteverything/domain';
import type { BottleLogsRepository } from '../../store/repositories/bottle-logs';
import type {
  BottleReadingsRepository,
  StoredDrink,
  StoredReading,
} from '../../store/repositories/bottle-readings';
import type { Store } from '../../store/store';
import type { Viewer } from './access';
import type { HomeClock } from './clock';
import { isoOfSeconds } from './summary';
import type { Snapshots } from './snapshots';
import type { StatsCache } from './views-stats';

export interface ViewDeps {
  readonly store: Store;
  readonly readings: BottleReadingsRepository;
  readonly logs: BottleLogsRepository;
  readonly snapshots: Snapshots;
  readonly clock: HomeClock;
  readonly now: () => Date;
  readonly holder: (device: DeviceRow) => WatchBridge | null;
  readonly syncing: (deviceId: string) => boolean;
  readonly stats: StatsCache;
}

export interface ViewContext {
  readonly deps: ViewDeps;
  readonly device: DeviceRow;
  readonly viewer: Viewer;
}

export const MS_PER_SECOND = 1000;

export const DAY_SECONDS = 86_400;

export function secondsOf(iso: string): number {
  return Math.floor(Date.parse(iso) / MS_PER_SECOND);
}

export function dayWindow(
  deps: Pick<ViewDeps, 'clock' | 'now'>,
  day: string,
): { readonly from: number; readonly to: number } {
  const offset = deps.clock.offsetOf(deps.now());
  const from = Math.floor(Date.parse(`${day}T00:00:00Z`) / MS_PER_SECOND) - offset;
  return { from, to: from + DAY_SECONDS - 1 };
}

export function readingRowOf(row: StoredReading): BottleReadingRow {
  return {
    at: isoOfSeconds(row.at),
    trigger: row.trigger,
    distanceMm: row.distanceMm,
    kcps: row.kcps,
    ledOhm: row.ledOhm,
    verdict: row.verdict,
    volumeMl: row.volumeMl,
    kind: row.kind,
    ml: row.eventMl,
    drunkMl: row.drunkMl,
  };
}

export function drinkRowOf(deps: Pick<ViewDeps, 'readings'>, row: StoredDrink): BottleDrinkRow {
  const alive = row.entryId !== null && deps.readings.entryVersion(row.entryId) !== null;
  return {
    at: isoOfSeconds(row.at),
    ml: row.ml,
    kind: row.kind,
    entryId: alive ? row.entryId : null,
    levelMl: row.levelMl,
  };
}
