import type { QueryClient } from '@tanstack/react-query';
import {
  HOME_MAP_SUMMARY_ROW,
  type HomeMap,
  type HomeMapSummary,
  type LiveWireChange,
} from '@smarteverything/domain';
import { z } from 'zod';
import { Logger, background } from '@smarteverything/logging';
import { sameJson } from '../../../store/same-json';
import { homeMapQueryKey } from './home-map-query';
import { HOME_MAP_FEEDS_QUERY_KEY, HOME_MAP_SET_QUERY_KEY, forgetMap } from './map-set-query';

const log = new Logger('app.home-map');

const SUMMARY_FACTS = HOME_MAP_SUMMARY_ROW.omit({ id: true }).partial();

type SummaryFacts = z.infer<typeof SUMMARY_FACTS>;

const MAP_KEY = z.object({ id: HOME_MAP_SUMMARY_ROW.shape.id });

export type HomeMapSignal =
  | {
      readonly kind: 'revision';
      readonly id: string;
      readonly row: SummaryFacts;
    }
  | { readonly kind: 'removed'; readonly id: string; readonly wasDefault: boolean };

function signalOf(change: LiveWireChange): HomeMapSignal | null {
  if (change.table !== 'home_maps') return null;
  if (change.operation === 'DELETE') {
    const gone = change.oldRecord;
    return { kind: 'removed', id: gone.id, wasDefault: gone.isDefault === true };
  }
  if (change.operation === 'INSERT') {
    return { kind: 'revision', id: change.record.id, row: change.record };
  }
  return {
    kind: 'revision',
    id: MAP_KEY.parse(change.key).id,
    row: SUMMARY_FACTS.parse(change.set),
  };
}

export function homeMapSignalsOf(changes: readonly LiveWireChange[]): readonly HomeMapSignal[] {
  const latest = new Map<string, HomeMapSignal>();
  for (const change of changes) {
    const signal = signalOf(change);
    if (signal !== null) latest.set(signal.id, signal);
  }
  return [...latest.values()];
}

export function homeMapBehind(cached: HomeMap | undefined, signal: HomeMapSignal): boolean {
  if (signal.kind === 'removed' || cached === undefined) return true;
  const revision = signal.row.revision;
  return revision !== undefined && revision > cached.revision;
}

function defaultMapStale(cached: HomeMap | undefined, signal: HomeMapSignal): boolean {
  if (cached === undefined) return false;
  if (signal.kind === 'removed') return cached.id === signal.id;
  const isDefault = signal.row.isDefault;
  if (cached.id !== signal.id) return isDefault === true;
  return isDefault === false || homeMapBehind(cached, signal);
}

function rowDiffers(row: SummaryFacts, entry: HomeMapSummary): boolean {
  if (row.revision !== undefined && row.revision > entry.revision) return true;
  if (row.name !== undefined && row.name !== entry.name) return true;
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

export function applyHomeMapChanges(client: QueryClient, changes: readonly LiveWireChange[]): void {
  const signals = homeMapSignalsOf(changes);
  if (signals.length === 0) return;
  const held = client.getQueryData<readonly HomeMapSummary[]>(HOME_MAP_SET_QUERY_KEY);
  for (const signal of signals) {
    log.info('home_map.summary_seen', {
      id: signal.id,
      kind: signal.kind,
      ...(signal.kind === 'revision' && signal.row.revision !== undefined
        ? { revision: signal.row.revision }
        : {}),
    });
    applyToMap(client, signal);
  }
  if (signals.some((signal) => homeMapSetBehind(held, signal))) {
    invalidate(client, HOME_MAP_SET_QUERY_KEY);
    invalidate(client, HOME_MAP_FEEDS_QUERY_KEY);
  }
}
