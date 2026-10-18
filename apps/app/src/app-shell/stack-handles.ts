import { useSyncExternalStore } from 'react';
import { ValueStore } from '../design/external-store';

export interface StackHandle {
  readonly key: string;
  readonly routeNames: () => readonly string[];
  readonly preload: (name: string, params: Readonly<Record<string, string>>) => void;
}

interface Registered {
  readonly group: string;
  readonly handle: StackHandle;
}

const registered = new ValueStore<ReadonlyMap<string, Registered>>(new Map());

export function registerStack(routeKey: string, group: string, handle: StackHandle): () => void {
  registered.update((current) => new Map(current).set(routeKey, { group, handle }));
  return (): void => {
    registered.update((current) => {
      const next = new Map(current);
      next.delete(routeKey);
      return next;
    });
  };
}

export function stackOfGroup(group: string): StackHandle | null {
  for (const entry of registered.get().values()) {
    if (entry.group === group) {
      return entry.handle;
    }
  }
  return null;
}

export function useStackOfGroup(group: string): StackHandle | null {
  return useSyncExternalStore(
    registered.subscribe,
    () => stackOfGroup(group),
    () => stackOfGroup(group),
  );
}
