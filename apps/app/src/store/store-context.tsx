import type { ReactNode } from 'react';
import { createContext, useContext, useRef, useSyncExternalStore } from 'react';
import type { CommandLedger } from './command-ledger';
import type { EntityStore } from './entity-store';
import { IDLE_SUBSCRIBE } from '../design/external-store';
import { ScreenPausedContext } from '../design/screen-pause';
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
  readonly deps: readonly unknown[] | undefined;
  readonly value: T;
}

function isFresh<T>(
  last: Cached<T>,
  state: StoreState,
  select: (state: StoreState) => T,
  deps: readonly unknown[] | undefined,
): boolean {
  if (last.state !== state) {
    return false;
  }
  if (deps === undefined || last.deps === undefined) {
    return last.select === select;
  }
  return shallowEqual(last.deps, deps);
}

export function useStoreSelector<T>(
  select: (state: StoreState) => T,
  equal: (left: T, right: T) => boolean = Object.is,
  deps?: readonly unknown[],
): T {
  const store = useEntityStore();
  const paused = useContext(ScreenPausedContext);
  const cache = useRef<Cached<T> | null>(null);
  const read = (): T => {
    const last = cache.current;
    const state = paused && last !== null ? last.state : store.get();
    if (last !== null && isFresh(last, state, select, deps)) {
      return last.value;
    }
    const value = select(state);
    const kept = last !== null && equal(last.value, value) ? last.value : value;
    cache.current = { state, select, deps, value: kept };
    return kept;
  };
  return useSyncExternalStore(paused ? IDLE_SUBSCRIBE : store.subscribe, read, read);
}

export function shallowEqual<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((item, index) => Object.is(item, right[index]));
}
