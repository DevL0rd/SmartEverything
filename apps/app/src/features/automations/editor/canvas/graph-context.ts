import { createContext, use, useMemo, useSyncExternalStore } from 'react';
import type { GraphRunNode, GraphRunOverlay, GraphRunStepper } from '../../model/graph/run-overlay';
import type { GraphCanvasIntent } from './graph-canvas-types';

export interface GraphNodeRun {
  readonly node: GraphRunNode | null;
  readonly stepper: GraphRunStepper | null;
}

const IDLE: GraphNodeRun = { node: null, stepper: null };

function sameProgress(left: GraphRunNode['progress'], right: GraphRunNode['progress']): boolean {
  return left?.done === right?.done && left?.total === right?.total;
}

function sameNode(left: GraphRunNode | undefined, right: GraphRunNode | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return (
    left.state === right.state &&
    left.text === right.text &&
    left.wakeAt === right.wakeAt &&
    left.iteration === right.iteration &&
    sameProgress(left.progress, right.progress)
  );
}

function sameStepper(
  left: GraphRunStepper | undefined,
  right: GraphRunStepper | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return (
    left.position === right.position &&
    left.total === right.total &&
    left.iteration === right.iteration
  );
}

function idsOf(...overlays: readonly (GraphRunOverlay | null)[]): ReadonlySet<string> {
  return new Set(
    overlays.flatMap((overlay) => [
      ...Object.keys(overlay?.nodes ?? {}),
      ...Object.keys(overlay?.stepper ?? {}),
    ]),
  );
}

function unchanged(
  id: string,
  previous: GraphRunOverlay | null,
  next: GraphRunOverlay | null,
): boolean {
  return (
    sameNode(previous?.nodes[id], next?.nodes[id]) &&
    sameStepper(previous?.stepper[id], next?.stepper[id])
  );
}

export class GraphRunStore {
  private overlay: GraphRunOverlay | null = null;
  private snapshots = new Map<string, GraphNodeRun>();
  private readonly listeners = new Map<string, Set<() => void>>();

  public read = (id: string): GraphNodeRun => this.snapshots.get(id) ?? IDLE;

  public subscribe = (id: string, listener: () => void): (() => void) => {
    const set = this.listeners.get(id) ?? new Set<() => void>();
    set.add(listener);
    this.listeners.set(id, set);
    return (): void => {
      set.delete(listener);
    };
  };

  public update(next: GraphRunOverlay | null): void {
    const previous = this.overlay;
    const held = this.snapshots;
    this.overlay = next;
    this.snapshots = new Map();
    for (const id of idsOf(previous, next)) {
      const same = unchanged(id, previous, next);
      const snapshot = same ? held.get(id) : snapshotOf(next, id);
      if (snapshot !== undefined) this.snapshots.set(id, snapshot);
      if (!same) this.notify(id);
    }
  }

  private notify(id: string): void {
    this.listeners.get(id)?.forEach((listener) => {
      listener();
    });
  }
}

function snapshotOf(overlay: GraphRunOverlay | null, id: string): GraphNodeRun | undefined {
  const node = overlay?.nodes[id];
  const stepper = overlay?.stepper[id];
  if (node === undefined && stepper === undefined) return undefined;
  return { node: node ?? null, stepper: stepper ?? null };
}

export class MissingGraphContextError extends Error {
  public override readonly name = 'MissingGraphContextError';

  public constructor() {
    super('A graph canvas card was rendered outside the graph canvas.');
  }
}

export const GraphRunContext = createContext<GraphRunStore | null>(null);

export const GraphEmitContext = createContext<((intent: GraphCanvasIntent) => void) | null>(null);

export function useGraphRun(id: string): GraphNodeRun {
  const store = use(GraphRunContext);
  if (store === null) throw new MissingGraphContextError();
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

export function useGraphEmit(): (intent: GraphCanvasIntent) => void {
  const emit = use(GraphEmitContext);
  if (emit === null) throw new MissingGraphContextError();
  return emit;
}
