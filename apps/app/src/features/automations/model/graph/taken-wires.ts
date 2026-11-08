import { shownIn } from '../../runs/run-view/run-loops';
import type { Activation } from '../../runs/run-view/run-activation';
import type { GraphScene, GraphSceneEdge, GraphSceneNode } from './scene-contract';

export interface TakenInput {
  readonly scene: GraphScene;
  readonly records: readonly Activation[];
  readonly iterations: ReadonlyMap<string, number>;
}

export interface JoinProgress {
  readonly done: number;
  readonly total: number;
}

const SCOPE_DECISIONS: ReadonlySet<string> = new Set(['flow.if', 'flow.switch']);

const JOIN_KIND = 'flow.join';

const ENTRY_FAMILIES: ReadonlySet<GraphSceneNode['family']> = new Set(['start', 'trigger']);

interface Context {
  readonly nodes: ReadonlyMap<string, GraphSceneNode>;
  readonly byNode: ReadonlyMap<string, readonly Activation[]>;
  readonly exits: ReadonlyMap<string, readonly GraphSceneEdge[]>;
}

function recordsByNode(input: TakenInput): ReadonlyMap<string, readonly Activation[]> {
  const grouped = new Map<string, Activation[]>();
  for (const record of input.records) {
    if (!shownIn(record, input.iterations)) continue;
    const held = grouped.get(record.nodeId) ?? [];
    held.push(record);
    grouped.set(record.nodeId, held);
  }
  return grouped;
}

function isLane(node: GraphSceneNode | undefined, handle: string): boolean {
  return node?.rows.some((row) => row.handle === handle && row.role === 'lane') ?? false;
}

function exitsByNode(
  nodes: ReadonlyMap<string, GraphSceneNode>,
  edges: readonly GraphSceneEdge[],
): ReadonlyMap<string, readonly GraphSceneEdge[]> {
  const grouped = new Map<string, GraphSceneEdge[]>();
  for (const edge of edges) {
    if (edge.kind !== 'exec' || isLane(nodes.get(edge.source.nodeId), edge.source.handle)) continue;
    const held = grouped.get(edge.source.nodeId) ?? [];
    held.push(edge);
    grouped.set(edge.source.nodeId, held);
  }
  return grouped;
}

function contextOf(input: TakenInput): Context {
  const nodes = new Map(input.scene.nodes.map((node) => [node.id, node]));
  return {
    nodes,
    byNode: recordsByNode(input),
    exits: exitsByNode(nodes, input.scene.edges),
  };
}

function sameIteration(left: Activation, right: Activation): boolean {
  const shared = Math.min(left.loops.length, right.loops.length);
  return left.loops.slice(0, shared).every((frame, index) => {
    const other = right.loops[index];
    return other?.nodeId === frame.nodeId && other.iteration === frame.iteration;
  });
}

function recordsOf(context: Context, nodeId: string): readonly Activation[] {
  return context.byNode.get(nodeId) ?? [];
}

function hasSeveralExits(node: GraphSceneNode | undefined): boolean {
  return (node?.rows.filter((row) => row.role !== 'lane').length ?? 0) > 1;
}

function isMerge(context: Context, nodeId: string): boolean {
  return (context.nodes.get(nodeId)?.mergeCount ?? null) !== null;
}

function ranTogether(
  edge: GraphSceneEdge,
  context: Context,
  accepts: (source: Activation, target: Activation) => boolean,
): boolean {
  const targets = recordsOf(context, edge.target.nodeId);
  return recordsOf(context, edge.source.nodeId).some((source) =>
    targets.some((target) => sameIteration(source, target) && accepts(source, target)),
  );
}

function waitingAtMerge(edge: GraphSceneEdge, context: Context): boolean {
  if (!isMerge(context, edge.target.nodeId)) return false;
  if (recordsOf(context, edge.target.nodeId).length > 0) return false;
  return recordsOf(context, edge.source.nodeId).some((source) => source.status === 'succeeded');
}

function firstFollower(
  source: Activation,
  exits: readonly GraphSceneEdge[],
  context: Context,
): Activation | undefined {
  const followers = exits.flatMap((exit) =>
    recordsOf(context, exit.target.nodeId).filter(
      (target) => sameIteration(source, target) && target.seq > source.seq,
    ),
  );
  return followers.reduce<Activation | undefined>(
    (first, next) => (first === undefined || next.seq < first.seq ? next : first),
    undefined,
  );
}

function takesFirstFollower(
  edge: GraphSceneEdge,
  exits: readonly GraphSceneEdge[],
  context: Context,
): boolean {
  return recordsOf(context, edge.source.nodeId).some(
    (source) => firstFollower(source, exits, context)?.nodeId === edge.target.nodeId,
  );
}

function ranInsideScope(decision: Activation, exit: GraphSceneEdge, context: Context): boolean {
  if (isMerge(context, exit.target.nodeId)) return false;
  return recordsOf(context, exit.target.nodeId).some(
    (target) => sameIteration(decision, target) && target.seq < decision.seq,
  );
}

function takesScopeExit(
  edge: GraphSceneEdge,
  exits: readonly GraphSceneEdge[],
  context: Context,
): boolean {
  const decisions = recordsOf(context, edge.source.nodeId);
  if (decisions.length === 0) {
    return (
      !isMerge(context, edge.target.nodeId) && recordsOf(context, edge.target.nodeId).length > 0
    );
  }
  return decisions.some((decision) => {
    const inside = exits.filter((exit) => ranInsideScope(decision, exit, context));
    if (inside.length > 0) return inside.includes(edge);
    return firstFollower(decision, exits, context)?.nodeId === edge.target.nodeId;
  });
}

function isUnrecordedEntry(source: GraphSceneNode | undefined, context: Context): boolean {
  return (
    source !== undefined &&
    ENTRY_FAMILIES.has(source.family) &&
    recordsOf(context, source.id).length === 0
  );
}

function entryTaken(edge: GraphSceneEdge, source: GraphSceneNode, context: Context): boolean {
  if (source.family === 'start') return recordsOf(context, edge.target.nodeId).length > 0;
  const triggers = [...context.nodes.values()].filter((node) => node.family === 'trigger');
  return triggers.length === 1 && context.byNode.size > 0;
}

function isTaken(edge: GraphSceneEdge, context: Context): boolean {
  if (edge.kind !== 'exec') return false;
  const source = context.nodes.get(edge.source.nodeId);
  if (source !== undefined && isUnrecordedEntry(source, context)) {
    return entryTaken(edge, source, context);
  }
  if (isLane(source, edge.source.handle)) return ranTogether(edge, context, () => true);
  if (!hasSeveralExits(source)) {
    return (
      ranTogether(edge, context, (record, target) => record.seq < target.seq) ||
      waitingAtMerge(edge, context)
    );
  }
  const exits = context.exits.get(edge.source.nodeId) ?? [];
  if (source !== undefined && SCOPE_DECISIONS.has(source.kind)) {
    return takesScopeExit(edge, exits, context);
  }
  return takesFirstFollower(edge, exits, context);
}

export function takenWires(input: TakenInput): readonly string[] {
  const context = contextOf(input);
  return input.scene.edges.filter((edge) => isTaken(edge, context)).map((edge) => edge.id);
}

export function joinProgress(input: TakenInput): ReadonlyMap<string, JoinProgress> {
  const context = contextOf(input);
  const progress = new Map<string, JoinProgress>();
  for (const node of input.scene.nodes) {
    if (node.kind !== JOIN_KIND) continue;
    const incoming = input.scene.edges.filter(
      (edge) => edge.kind === 'exec' && edge.target.nodeId === node.id,
    );
    const done = incoming.filter((edge) =>
      (context.byNode.get(edge.source.nodeId) ?? []).some(
        (record) => record.status === 'succeeded',
      ),
    );
    progress.set(node.id, { done: done.length, total: incoming.length });
  }
  return progress;
}

export function progressText(progress: JoinProgress): string {
  return `${String(progress.done)} of ${String(progress.total)} done`;
}
