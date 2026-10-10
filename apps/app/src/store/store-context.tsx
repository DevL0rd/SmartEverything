import type { ReactNode } from 'react';
import { createContext, useContext, useRef, useSyncExternalStore } from 'react';
import type { CommandLedger } from './command-ledger';
import type { EntityStore } from './entity-store';
import type { StoreState } from './state';

export interface StoreRuntime {
  readonly store: EntityStore;
  readonly ledger: CommandLedger;
}

const StoreContext = createContext<StoreRuntime | null>(null);

class NoStoreError extends Error {
  override readonly name = 'NoStoreError';

  constructor() {
    super('This part of the app reads your home, but no paired server store is mounted above it.');
  }
}

export function StoreProvider({
  runtime,
  children,
}: {
  readonly runtime: StoreRuntime;
  readonly children: ReactNode;
}): ReactNode {
  return <StoreContext.Provider value={runtime}>{children}</StoreContext.Provider>;
}

function useRuntime(): StoreRuntime {
  const runtime = useContext(StoreContext);
  if (runtime === null) {
    throw new NoStoreError();
  }
  return runtime;
}

export function useEntityStore(): EntityStore {
  return useRuntime().store;
}

export function useLedger(): CommandLedger {
  return useRuntime().ledger;
}

interface Cached<T> {
  readonly state: StoreState;
  readonly select: (state: StoreState) => T;
  readonly value: T;
}

export function useStoreSelector<T>(
  select: (state: StoreState) => T,
  equal: (left: T, right: T) => boolean = Object.is,
): T {
  const store = useEntityStore();
  const cache = useRef<Cached<T> | null>(null);
  const read = (): T => {
    const state = store.get();
    const last = cache.current;
    if (last !== null && last.state === state && last.select === select) {
      return last.value;
    }
    const value = select(state);
    const kept = last !== null && equal(last.value, value) ? last.value : value;
    cache.current = { state, select, value: kept };
    return kept;
  };
  return useSyncExternalStore(store.subscribe, read, read);
}

export function shallowEqual<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((item, index) => Object.is(item, right[index]));
}
