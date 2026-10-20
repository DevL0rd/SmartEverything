import type { ClassifiedRow } from '@smarteverything/ble';
import { waterEntryOf, type EntrySpan } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type {
  BottleReadingsRepository,
  StoredDrink,
} from '../../store/repositories/bottle-readings';
import type { Store } from '../../store/store';
import type { HomeClock } from './clock';
import type { BottleEntryConfig } from './config';

export interface DrinkItem {
  readonly at: number;
  readonly kind: 'drink' | 'fill';
  readonly ml: number;
  readonly levelMl: number | null;
}

export interface DrinksDeps {
  readonly store: Pick<Store, 'healthEntries'>;
  readonly readings: Pick<
    BottleReadingsRepository,
    'insertDrink' | 'attachEntry' | 'drink' | 'entryVersion' | 'setDrinkMl'
  >;
  readonly clock: HomeClock;
  readonly log: Logger;
}

interface DrinkTarget {
  readonly deviceId: string;
  readonly serial: string;
  readonly binding: BottleEntryConfig['binding'];
}

const MS_PER_SECOND = 1000;

const SPAN_MS = 60_000;

export function drinkItemsOf(rows: readonly ClassifiedRow[]): DrinkItem[] {
  return rows.flatMap((classified): DrinkItem[] => {
    const { event } = classified;
    const at = classified.row.at;
    if (event.kind === 'drink') {
      return [{ at, kind: 'drink', ml: event.ml, levelMl: classified.volumeMl }];
    }
    if (event.kind !== 'fill') {
      return [];
    }
    const fill: DrinkItem = {
      at,
      kind: 'fill',
      ml: Math.max(0, event.toMl - event.fromMl),
      levelMl: classified.volumeMl,
    };
    return event.drunkMl > 0
      ? [{ at, kind: 'drink', ml: event.drunkMl, levelMl: event.fromMl }, fill]
      : [fill];
  });
}

function spanOf(deps: DrinksDeps, at: number): EntrySpan {
  const end = new Date(at * MS_PER_SECOND);
  return {
    startTime: new Date(end.getTime() - SPAN_MS).toISOString(),
    endTime: end.toISOString(),
    zoneOffsetSeconds: deps.clock.offsetOf(end),
  };
}

function updateExisting(
  deps: DrinksDeps,
  target: DrinkTarget,
  item: DrinkItem,
  existing: StoredDrink,
): boolean {
  const { entryId, profileId } = existing;
  if (existing.ml === item.ml || entryId === null || profileId === null) {
    return false;
  }
  if (deps.readings.entryVersion(entryId) !== 1) {
    return false;
  }
  deps.store.healthEntries.update(entryId, profileId, waterEntryOf(item.ml, spanOf(deps, item.at)));
  deps.readings.setDrinkMl(target.deviceId, item.at, item.kind, item.ml);
  return true;
}

interface DrinkOutcome {
  readonly created: readonly DrinkItem[];
  readonly corrected: number;
}

function attachEntry(
  deps: DrinksDeps,
  target: DrinkTarget,
  item: DrinkItem,
  profileId: string,
): void {
  const source = { source: 'larq', key: `${target.serial}:${String(item.at)}` } as const;
  const entryId =
    deps.store.healthEntries.idBySource(profileId, source) ??
    deps.store.healthEntries.create(profileId, waterEntryOf(item.ml, spanOf(deps, item.at)), source)
      .id;
  deps.readings.attachEntry(target.deviceId, item.at, 'drink', entryId);
}

export function saveDrinks(
  deps: DrinksDeps,
  target: DrinkTarget,
  items: readonly DrinkItem[],
): DrinkOutcome {
  const created: DrinkItem[] = [];
  let corrected = 0;
  const profileId = target.binding.profileId;
  for (const item of items) {
    if (item.kind === 'drink' && profileId === null) {
      continue;
    }
    const drink: StoredDrink = {
      at: item.at,
      kind: item.kind,
      ml: item.ml,
      levelMl: item.levelMl,
      profileId: item.kind === 'drink' ? profileId : null,
      entryId: null,
    };
    if (!deps.readings.insertDrink(target.deviceId, drink)) {
      const existing = deps.readings.drink(target.deviceId, item.at, item.kind);
      if (existing !== undefined && updateExisting(deps, target, item, existing)) {
        corrected += 1;
      }
      continue;
    }
    created.push(item);
    if (item.kind === 'drink' && profileId !== null) {
      attachEntry(deps, target, item, profileId);
    }
  }
  return { created, corrected };
}
