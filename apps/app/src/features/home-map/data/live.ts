import type { QueryClient } from '@tanstack/react-query';
import type {
  HomeMap,
  HomeMapSummary,
  HomeMapSummaryRow,
  LiveChange,
} from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { sameJson } from '../../../store/same-json';
import { homeMapQueryKey } from './home-map-query';
import { HOME_MAP_FEEDS_QUERY_KEY, HOME_MAP_SET_QUERY_KEY, forgetMap } from './map-set-query';

const log = new Logger('app.home-map');

export type HomeMapSignal =
  | {
      readonly kind: 'revision';
      readonly id: string;
      readonly revision: number;
      readonly row: HomeMapSummaryRow;
    }
  | { readonly kind: 'removed'; readonly id: string; readonly wasDefault: boolean };

export function homeMapSignalsOf(changes: readonly LiveChange[]): readonly HomeMapSignal[] {
  const latest = new Map<string, HomeMapSignal>();
  for (const change of changes) {
    if (change.table !== 'home_maps') continue;
    if (change.record === null) {
      const gone = change.oldRecord;
      if (gone === null) continue;
      latest.set(gone.id, { kind: 'removed', id: gone.id, wasDefault: gone.isDefault === true });
    } else {
      const row = change.record;
      latest.set(row.id, { kind: 'revision', id: row.id, revision: row.revision, row });
    }
  }
  return [...latest.values()];
}

export function homeMapBehind(cached: HomeMap | undefined, signal: HomeMapSignal): boolean {
  if (signal.kind === 'removed' || cached === undefined) return true;
  return signal.revision > cached.revision;
}

function defaultMapStale(cached: HomeMap | undefined, signal: HomeMapSignal): boolean {
  if (cached === undefined) return false;
  if (signal.kind === 'removed') return cached.id === signal.id;
  const isDefault = signal.row.isDefault;
  if (cached.id !== signal.id) return isDefault === true;
  return isDefault === false || homeMapBehind(cached, signal);
}

function rowDiffers(row: HomeMapSummaryRow, entry: HomeMapSummary): boolean {
  if (row.revision > entry.revision || row.name !== entry.name) return true;
  const carried: readonly (readonly [unknown, unknown])[] = [
    [row.position, entry.position],
    [row.isDefault, entry.isDefault],
    [row.hasScan, entry.hasScan],
    [row.fedBy, entry.fedBy],
  ];
  return carried.some(([live, held]) => live !== undefined && !sameJson(live, held));
}

export function homeMapSetBehind(
  held: readonly HomeMapSummary[] | undefined,
  signal: HomeMapSignal,
): boolean {
  if (held === undefined) return true;
  const entry = held.find((map) => map.id === signal.id);
  if (signal.kind === 'removed') return entry !== undefined;
  return entry === undefined || rowDiffers(signal.row, entry);
}

function invalidate(client: QueryClient, queryKey: readonly unknown[]): void {
  background(client.invalidateQueries({ queryKey }), 'home_map.invalidate_failed');
}

function applyToMap(client: QueryClient, signal: HomeMapSignal): void {
  if (signal.kind === 'removed') {
    forgetMap(client, signal.id);
    return;
  }
  const own = client.getQueryData<HomeMap>(homeMapQueryKey(signal.id));
  if (homeMapBehind(own, signal)) invalidate(client, homeMapQueryKey(signal.id));
  if (defaultMapStale(client.getQueryData<HomeMap>(homeMapQueryKey()), signal)) {
    invalidate(client, homeMapQueryKey());
  }
}

export function applyHomeMapChanges(client: QueryClient, changes: readonly LiveChange[]): void {
  const signals = homeMapSignalsOf(changes);
  if (signals.length === 0) return;
  const held = client.getQueryData<readonly HomeMapSummary[]>(HOME_MAP_SET_QUERY_KEY);
  for (const signal of signals) {
    log.info('home_map.summary_seen', {
      id: signal.id,
      kind: signal.kind,
      ...(signal.kind === 'revision' ? { revision: signal.revision } : {}),
    });
    applyToMap(client, signal);
  }
  if (signals.some((signal) => homeMapSetBehind(held, signal))) {
    invalidate(client, HOME_MAP_SET_QUERY_KEY);
    invalidate(client, HOME_MAP_FEEDS_QUERY_KEY);
  }
}
