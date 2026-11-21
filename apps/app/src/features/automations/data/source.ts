import { ACTIVE_RUN_RECORD_STATUSES, type NodeKindLookup } from '@smarteverything/domain';
import { use, useMemo } from 'react';
import type { NodeKind } from '@smarteverything/domain';
import { usePausable } from '../../../design/external-store';
import type { EntityStore } from '../../../store/entity-store';
import { liveRowEdit, writeOptimistically, type Edit } from '../../../store/optimistic';
import { rowsOf, type RowOf } from '../../../store/state';
import { StoreContext } from '../../../store/store-runtime';
import * as hubApi from './api';
import { AutomationsSourceContext } from './source-context';
import {
  parseAutomationRows,
  type AutomationRows,
  type AutomationRowsSource,
} from './automation-rows';
import { kindsOfState, type KindLookup } from './kind-lookup';
import { automationTrace, type TraceChannel } from './trace-channel';

export type AutomationsApi = typeof hubApi;

export interface KindSource {
  readonly snapshot: () => KindLookup;
  readonly subscribe: (listener: () => void) => () => void;
}

export type StoredAutomation = RowOf<'automations'>;

export interface AutomationWrite<T> {
  readonly event: string;
  readonly automationId: string;
  readonly change: (row: StoredAutomation) => StoredAutomation | null;
  readonly added?: (row: StoredAutomation) => StoredAutomation;
  readonly send: () => Promise<T>;
}

export type AutomationWriter = <T>(write: AutomationWrite<T>) => Promise<T>;

export interface AutomationsSource {
  readonly api: AutomationsApi;
  readonly write: AutomationWriter;
  readonly automations: AutomationRowsSource;
  readonly kindSource: KindSource;
  readonly trace: TraceChannel;
  readonly runWaitChanges: (listener: () => void) => () => void;
}

export interface ResolvedAutomationsSource extends Omit<AutomationsSource, 'kindSource'> {
  readonly kinds: readonly NodeKind[];
  readonly lookup: KindLookup;
}

class NoAutomationsSourceError extends Error {
  override readonly name = 'NoAutomationsSourceError';

  constructor() {
    super('The automations screens need a paired server store or an injected data source.');
  }
}

function storeRows(store: EntityStore, kinds: KindSource): AutomationRowsSource {
  let source: readonly unknown[] | null = null;
  let lookup: NodeKindLookup | null = null;
  let cached: AutomationRows = { rows: [], rejected: 0, unstructured: [] };
  return {
    snapshot: (): AutomationRows => {
      const rows = rowsOf(store.get().tables.automations);
      const current = kinds.snapshot();
      if (rows !== source || current !== lookup) {
        source = rows;
        lookup = current;
        cached = parseAutomationRows(rows, current);
      }
      return cached;
    },
    subscribe: (listener) =>
      store.subscribeSlices(['tables.automations', 'tables.automation_plugin_kinds'], listener),
  };
}

function storeKinds(store: EntityStore): KindSource {
  return {
    snapshot: () => kindsOfState(store.get()),
    subscribe: (listener) => store.subscribeSlices(['tables.automation_plugin_kinds'], listener),
  };
}

function writeEdits<T>(
  previous: StoredAutomation | null,
  write: AutomationWrite<T>,
): readonly Edit[] {
  if (previous === null) return [];
  const next = write.change(previous);
  const changed =
    next === previous ? [] : [liveRowEdit('automations', write.automationId, previous, next)];
  const row = write.added?.(previous) ?? null;
  return row === null ? changed : [...changed, liveRowEdit('automations', row.id, null, row)];
}

function storeWriter(store: EntityStore): AutomationWriter {
  return (write) => {
    const { automationId } = write;
    const previous = store.get().tables.automations.byId[automationId] ?? null;
    return writeOptimistically(store, {
      event: write.event,
      edits: writeEdits(previous, write),
      send: write.send,
      fields: { automationId },
    });
  };
}

interface RunWaits {
  readonly waiting: ReadonlySet<string>;
  readonly held: ReadonlySet<string>;
}

function runWaitsOf(store: EntityStore, previous: RunWaits | null): RunWaits {
  const waiting = new Set<string>();
  const held = new Set<string>();
  rowsOf(store.get().tables.automation_runs).forEach((run) => {
    if (run.status === 'waiting') {
      waiting.add(run.id);
      held.add(run.id);
    } else if (previous?.held.has(run.id) === true && ACTIVE_RUN_RECORD_STATUSES.has(run.status)) {
      held.add(run.id);
    }
  });
  return { waiting, held };
}

function sameIds(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((id) => right.has(id));
}

function runWaitChanges(store: EntityStore, listener: () => void): () => void {
  let waits = runWaitsOf(store, null);
  return store.subscribeSlices(['tables.automation_runs'], () => {
    const next = runWaitsOf(store, waits);
    const changed = !sameIds(waits.waiting, next.waiting) || !sameIds(waits.held, next.held);
    waits = next;
    if (changed) listener();
  });
}

const HUB_SOURCES = new WeakMap<EntityStore, AutomationsSource>();

export function hubSource(store: EntityStore): AutomationsSource {
  const known = HUB_SOURCES.get(store);
  if (known !== undefined) return known;
  const kindSource = storeKinds(store);
  const source: AutomationsSource = {
    api: hubApi,
    write: storeWriter(store),
    automations: storeRows(store, kindSource),
    kindSource,
    trace: automationTrace,
    runWaitChanges: (listener) => runWaitChanges(store, listener),
  };
  HUB_SOURCES.set(store, source);
  return source;
}

export function useAutomationsSource(): ResolvedAutomationsSource {
  const injected = use(AutomationsSourceContext);
  const runtime = use(StoreContext);
  const source = useMemo(() => {
    if (injected !== null) return injected;
    if (runtime === null) throw new NoAutomationsSourceError();
    return hubSource(runtime.store);
  }, [injected, runtime]);
  const lookup = usePausable(source.kindSource.subscribe, source.kindSource.snapshot);
  return useMemo(
    () => ({
      api: source.api,
      write: source.write,
      automations: source.automations,
      trace: source.trace,
      runWaitChanges: source.runWaitChanges,
      kinds: lookup.kinds,
      lookup,
    }),
    [source, lookup],
  );
}
