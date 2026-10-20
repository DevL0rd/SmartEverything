import { useSyncExternalStore } from 'react';
import { ValueStore } from '../design/external-store';

export type RouteParams = Readonly<Record<string, string>>;

export interface HeldRoute {
  readonly key: string;
  readonly name: string;
  readonly params: RouteParams;
}

export interface StackHandle {
  readonly key: string;
  readonly routeNames: () => readonly string[];
  readonly declares: (name: string) => boolean;
  readonly opened: () => readonly HeldRoute[];
  readonly preloaded: () => readonly HeldRoute[];
  readonly preload: (name: string, params: RouteParams) => void;
  readonly drop: (routeKey: string) => void;
}

export interface HostedStack {
  readonly group: string;
  readonly handle: StackHandle;
}

const registered = new ValueStore<ReadonlyMap<string, HostedStack>>(new Map());
const changes = new ValueStore(0);
let changePending = false;

export function noteStackChanged(): void {
  if (changePending) return;
  changePending = true;
  queueMicrotask(() => {
    changePending = false;
    changes.update((count) => count + 1);
  });
}

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

export function hostedStacks(entries: ReadonlyMap<string, HostedStack>): readonly HostedStack[] {
  const seen = new Set<string>();
  return [...entries.values()].filter((entry) => {
    if (seen.has(entry.handle.key)) return false;
    seen.add(entry.handle.key);
    return true;
  });
}

export function useStackChanges(): number {
  return useSyncExternalStore(changes.subscribe, changes.get, changes.get);
}

export function useRegisteredStacks(): ReadonlyMap<string, HostedStack> {
  return useSyncExternalStore(registered.subscribe, registered.get, registered.get);
}
