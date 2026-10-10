import { use, useRef, useSyncExternalStore } from 'react';
import { ScreenPausedContext } from './screen-pause';

export class ValueStore<T> {
  private readonly listeners = new Set<() => void>();

  constructor(private value: T) {}

  readonly get = (): T => this.value;

  readonly set = (next: T): void => {
    if (Object.is(next, this.value)) {
      return;
    }
    this.value = next;
    for (const listener of this.listeners) {
      listener();
    }
  };

  readonly update = (change: (current: T) => T): void => {
    this.set(change(this.value));
  };

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  };
}

export const IDLE_SUBSCRIBE = (): (() => void) => () => undefined;

export function usePausable<T>(subscribe: (listener: () => void) => () => void, read: () => T): T {
  const paused = use(ScreenPausedContext);
  const last = useRef<{ readonly value: T } | null>(null);
  const snapshot = (): T => {
    if (paused && last.current !== null) {
      return last.current.value;
    }
    const value = read();
    last.current = { value };
    return value;
  };
  return useSyncExternalStore(paused ? IDLE_SUBSCRIBE : subscribe, snapshot, snapshot);
}

export function useSelected<T, S extends string | number | boolean | null>(
  store: ValueStore<T>,
  select: (value: T) => S,
): S {
  return usePausable(store.subscribe, () => select(store.get()));
}

export function useValue<T>(store: ValueStore<T>): T {
  return usePausable(store.subscribe, store.get);
}
