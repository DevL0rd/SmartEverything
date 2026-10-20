import { createContext, use, useMemo } from 'react';
import { ALL_NODE_KINDS, type NodeKind } from '@smarteverything/domain';
import type { EntityStore } from '../../../store/entity-store';
import { rowsOf } from '../../../store/state';
import { StoreContext } from '../../../store/store-runtime';
import * as hubApi from './api';
import {
  parseAutomationRows,
  type AutomationRows,
  type AutomationRowsSource,
} from './automation-rows';
import { automationTrace, type TraceChannel } from './trace-channel';

export type AutomationsApi = typeof hubApi;

export interface AutomationsSource {
  readonly api: AutomationsApi;
  readonly automations: AutomationRowsSource;
  readonly kinds: readonly NodeKind[];
  readonly trace: TraceChannel;
  readonly runChanges: (listener: () => void) => () => void;
}

class NoAutomationsSourceError extends Error {
  override readonly name = 'NoAutomationsSourceError';

  constructor() {
    super('The automations screens need a paired server store or an injected data source.');
  }
}

function storeRows(store: EntityStore): AutomationRowsSource {
  let source: readonly unknown[] | null = null;
  let cached: AutomationRows = { rows: [], rejected: 0 };
  return {
    snapshot: (): AutomationRows => {
      const rows = rowsOf(store.get().tables.automations);
      if (rows !== source) {
        source = rows;
        cached = parseAutomationRows(rows);
      }
      return cached;
    },
    subscribe: (listener) => store.subscribeSlices(['tables.automations'], listener),
  };
}

export function hubSource(store: EntityStore): AutomationsSource {
  return {
    api: hubApi,
    automations: storeRows(store),
    kinds: ALL_NODE_KINDS,
    trace: automationTrace,
    runChanges: (listener) => store.subscribeSlices(['tables.automation_runs'], listener),
  };
}

export const AutomationsSourceContext = createContext<AutomationsSource | null>(null);

export function useAutomationsSource(): AutomationsSource {
  const injected = use(AutomationsSourceContext);
  const runtime = use(StoreContext);
  return useMemo(() => {
    if (injected !== null) return injected;
    if (runtime === null) throw new NoAutomationsSourceError();
    return hubSource(runtime.store);
  }, [injected, runtime]);
}
