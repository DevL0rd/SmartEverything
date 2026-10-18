import type { ReactNode } from 'react';
import { use, useCallback, useContext, useRef, useSyncExternalStore } from 'react';
import { WidgetPickerSource, type PickerState } from '../components/widget-board';
import type { CommandLedger } from './command-ledger';
import type { EntityStore } from './entity-store';
import { ScreenPausedContext } from '../design/screen-pause';
import { rowsOf, type StoreState } from './state';
import { StoreContext, type StoreRuntime } from './store-runtime';
import { trackReads, type Slice } from './subscriptions';

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
  return (
    <StoreContext.Provider value={runtime}>
      <WidgetPickerSource read={() => pickerStateOf(runtime.store.get())}>
        {children}
      </WidgetPickerSource>
    </StoreContext.Provider>
  );
}

function pickerStateOf(state: StoreState): PickerState {
  return {
    devices: rowsOf(state.tables.devices),
    rooms: rowsOf(state.tables.rooms),
    groups: rowsOf(state.tables.device_groups),
  };
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
  readonly select: (state: StoreState) => T;
  readonly deps: readonly unknown[] | undefined;
  readonly value: T;
  readonly reads: ReadonlySet<Slice>;
  readonly readAt: number;
}

const NO_READS: ReadonlySet<Slice> = new Set();

function sameInputs<T>(
  last: Cached<T>,
  select: (state: StoreState) => T,
  deps: readonly unknown[] | undefined,
): boolean {
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
  const pause = use(ScreenPausedContext);
  const cache = useRef<Cached<T> | null>(null);
  const subscribe = useCallback(
    (wake: () => void) => {
      const off = store.subscriptions.add({
        get reads() {
          return cache.current?.reads ?? NO_READS;
        },
        wake: pause.gate(wake),
      });
      return (): void => {
        off();
        pause.release(wake);
      };
    },
    [store, pause],
  );
  const read = (): T => {
    const last = cache.current;
    if (last !== null) {
      if (pause.isPaused()) return last.value;
      if (sameInputs(last, select, deps) && store.subscriptions.isFresh(last.reads, last.readAt)) {
        return last.value;
      }
    }
    const readAt = store.subscriptions.version;
    const { value, reads } = trackReads(store.get(), select);
    const kept =
      last !== null && (Object.is(last.value, value) || equal(last.value, value))
        ? last.value
        : value;
    cache.current = { select, deps, value: kept, reads, readAt };
    return kept;
  };
  return useSyncExternalStore(subscribe, read, read);
}

export function shallowEqual<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((item, index) => Object.is(item, right[index]));
}
