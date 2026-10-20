import { createContext, use, useMemo, useSyncExternalStore } from 'react';
import type { RunNode, RunOverlay } from '../../model/canvas/contract';

function same(left: RunNode | undefined, right: RunNode | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return (
    left.state === right.state && left.text === right.text && left.iteration === right.iteration
  );
}

export class RunStore {
  private entries: RunOverlay = {};
  private readonly listeners = new Map<string, Set<() => void>>();

  public read = (id: string): RunNode | null => this.entries[id] ?? null;

  public subscribe = (id: string, listener: () => void): (() => void) => {
    const set = this.listeners.get(id) ?? new Set<() => void>();
    set.add(listener);
    this.listeners.set(id, set);
    return (): void => {
      set.delete(listener);
    };
  };

  public update(next: RunOverlay): void {
    const previous = this.entries;
    this.entries = next;
    for (const id of new Set([...Object.keys(previous), ...Object.keys(next)])) {
      if (same(previous[id], next[id])) continue;
      this.listeners.get(id)?.forEach((listener) => {
        listener();
      });
    }
  }
}

export class MissingRunStoreError extends Error {
  public override readonly name = 'MissingRunStoreError';

  public constructor() {
    super('A canvas node or edge was rendered outside the canvas.');
  }
}

export const RunStoreContext = createContext<RunStore | null>(null);

function useRunStore(): RunStore {
  const store = use(RunStoreContext);
  if (store === null) throw new MissingRunStoreError();
  return store;
}

export function useRunNode(id: string): RunNode | null {
  const store = useRunStore();
  const subscribe = useMemo(
    () =>
      (listener: () => void): (() => void) =>
        store.subscribe(id, listener),
    [store, id],
  );
  return useSyncExternalStore(
    subscribe,
    () => store.read(id),
    () => store.read(id),
  );
}
