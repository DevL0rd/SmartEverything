import type { NodeKindLookup } from '@smarteverything/domain';
import { createContext, use, useMemo, useSyncExternalStore } from 'react';
import type { NodeKind } from '@smarteverything/domain';
import type { EntityStore } from '../../../store/entity-store';
import { rowsOf } from '../../../store/state';
import { StoreContext } from '../../../store/store-runtime';
import * as hubApi from './api';
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

export interface AutomationsSource {
  readonly api: AutomationsApi;
  readonly automations: AutomationRowsSource;
  readonly kindSource: KindSource;
  readonly trace: TraceChannel;
  readonly runChanges: (listener: () => void) => () => void;
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

export function hubSource(store: EntityStore): AutomationsSource {
  const kindSource = storeKinds(store);
  return {
    api: hubApi,
    automations: storeRows(store, kindSource),
    kindSource,
    trace: automationTrace,
    runChanges: (listener) => store.subscribeSlices(['tables.automation_runs'], listener),
  };
}

export const AutomationsSourceContext = createContext<AutomationsSource | null>(null);

export function useAutomationsSource(): ResolvedAutomationsSource {
  const injected = use(AutomationsSourceContext);
  const runtime = use(StoreContext);
  const source = useMemo(() => {
    if (injected !== null) return injected;
    if (runtime === null) throw new NoAutomationsSourceError();
    return hubSource(runtime.store);
  }, [injected, runtime]);
  const lookup = useSyncExternalStore(
    source.kindSource.subscribe,
    source.kindSource.snapshot,
    source.kindSource.snapshot,
  );
  return useMemo(
    () => ({
      api: source.api,
      automations: source.automations,
      trace: source.trace,
      runChanges: source.runChanges,
      kinds: lookup.kinds,
      lookup,
    }),
    [source, lookup],
  );
}
