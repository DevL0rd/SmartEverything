import { useSyncExternalStore } from 'react';

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

export function useValue<T>(store: ValueStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
