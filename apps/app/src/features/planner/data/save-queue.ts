import { Logger, background } from '@smarteverything/logging';
import { useCallback } from 'react';
import { usePausable } from '../../../design/external-store';
import type { EntityStore } from '../../../store/entity-store';
import { useEntityStore } from '../../../store/store-context';
import type { PlannerPerson } from './person';

const log = new Logger('app.planner');

export type Change = object;

export interface SaveQueueOptions<C extends Change> {
  readonly event: string;
  readonly send: (change: C) => Promise<unknown>;
  readonly failed: (error: unknown, change: C) => void;
}

export interface SaveQueue<C extends Change> {
  readonly push: (change: C) => void;
  readonly unsaved: () => C | null;
  readonly subscribe: (listener: () => void) => () => void;
}

interface QueueState<C extends Change> {
  readonly flying: C | null;
  readonly waiting: C | null;
  readonly unsaved: C | null;
}

function merged<C extends Change>(base: C | null, next: C | null): C | null {
  if (base === null) return next;
  return next === null ? base : { ...base, ...next };
}

function stateOf<C extends Change>(flying: C | null, waiting: C | null): QueueState<C> {
  return { flying, waiting, unsaved: merged(flying, waiting) };
}

export function createSaveQueue<C extends Change>(options: SaveQueueOptions<C>): SaveQueue<C> {
  let state = stateOf<C>(null, null);
  const listeners = new Set<() => void>();
  const set = (next: QueueState<C>): void => {
    state = next;
    for (const listener of listeners) listener();
  };
  const settle = (): void => {
    advance(null, state.waiting);
  };
  const advance = (flying: C | null, waiting: C | null): void => {
    if (flying !== null || waiting === null) {
      set(stateOf(flying, waiting));
      return;
    }
    const change = waiting;
    set(stateOf(change, null));
    log.debug(`${options.event}.sent`, () => ({ keys: Object.keys(change) }));
    background(
      options.send(change).then(settle, (error: unknown) => {
        options.failed(error, change);
        settle();
      }),
      `${options.event}.queue_failed`,
    );
  };
  return {
    push: (change): void => {
      advance(state.flying, merged(state.waiting, change));
    },
    unsaved: () => state.unsaved,
    subscribe: (listener) => {
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
      };
    },
  };
}

export type QueueOf<C extends Change> = (
  store: EntityStore,
  person: PlannerPerson,
  id: string,
) => SaveQueue<C>;

export function keyedQueues<C extends Change>(
  build: (store: EntityStore, person: PlannerPerson, id: string) => SaveQueueOptions<C>,
): QueueOf<C> {
  const queues = new WeakMap<EntityStore, Map<string, SaveQueue<C>>>();
  return (store, person, id) => {
    const known = queues.get(store) ?? new Map<string, SaveQueue<C>>();
    queues.set(store, known);
    const key = `${person ?? 'me'}:${id}`;
    const existing = known.get(key);
    if (existing !== undefined) return existing;
    const queue = createSaveQueue(build(store, person, id));
    known.set(key, queue);
    return queue;
  };
}

export interface QueuedSaves<C extends Change> {
  readonly unsaved: C | null;
  readonly save: (change: C) => void;
}

const NONE = (): null => null;
const QUIET = (): (() => void) => () => undefined;

export function useQueuedSaves<C extends Change>(
  queueOf: QueueOf<C>,
  person: PlannerPerson,
  id: string | null,
): QueuedSaves<C> {
  const store = useEntityStore();
  const queue = id === null ? null : queueOf(store, person, id);
  const unsaved = usePausable(queue?.subscribe ?? QUIET, queue?.unsaved ?? NONE);
  const save = useCallback(
    (change: C): void => {
      if (queue === null) throw new Error('A new row has nothing saved to change yet.');
      queue.push(change);
    },
    [queue],
  );
  return { unsaved, save };
}
