import type { Program } from '@smarteverything/flow/program/walk';
import type { InsertPoint, LoopReturn, Scene, SceneEdge, SceneMode, SceneNode } from './contract';
import { layoutCompact, layoutWide } from './layout';
import { isCompactLeaf } from './layout-compact';
import type { InsertSpot, Layouted } from './layout-types';
import { execEdgesOf } from './scene-edges';
import { buildTree, type Tree } from './tree';
import type { Draft, Item, Lane, ProjectOptions } from './tree-env';

export interface SceneInput extends ProjectOptions {
  readonly mode: SceneMode;
  readonly canvasWidth?: number;
}

export const DEFAULT_COMPACT_WIDTH = 375;

function visitItem(item: Item, out: Draft[]): void {
  for (const value of item.values) visitItem(value, out);
  out.push(item.draft);
  for (const lane of item.lanes) visitLane(lane, out);
}

function visitLane(lane: Lane, out: Draft[]): void {
  if (lane.draft !== null) out.push(lane.draft);
  if (lane.slot !== null) out.push(lane.slot);
  for (const item of lane.items) visitItem(item, out);
}

function orderedDrafts(tree: Tree, compact: boolean): readonly Draft[] {
  const out: Draft[] = [];
  if (tree.inputs !== null) out.push(tree.inputs);
  if (compact && tree.group !== null) out.push(tree.group);
  for (const trigger of tree.triggers) out.push(trigger.draft);
  if (tree.admit !== null) out.push(tree.admit);
  visitLane(tree.body, out);
  if (tree.failure !== null) visitLane(tree.failure, out);
  if (tree.exits !== null) out.push(tree.exits);
  return out;
}

function leavesWithBody(tree: Tree): ReadonlySet<string> {
  const ids = new Set<string>();
  const walk = (lane: Lane): void => {
    for (const item of lane.items) {
      if (item.lanes.length > 0 && isCompactLeaf(item)) ids.add(item.draft.id);
      item.lanes.forEach(walk);
    }
  };
  walk(tree.body);
  if (tree.failure !== null) walk(tree.failure);
  return ids;
}

function sceneNodes(tree: Tree, layouted: Layouted, compact: boolean): readonly SceneNode[] {
  const opens = compact ? leavesWithBody(tree) : new Set<string>();
  return orderedDrafts(tree, compact).flatMap((draft) => {
    const rect = layouted.rects.get(draft.id);
    if (rect === undefined) return [];
    return [
      {
        ...draft,
        ...rect,
        parentId: layouted.parents.get(draft.id) ?? null,
        opensBody: opens.has(draft.id),
      },
    ];
  });
}

function present(edges: readonly SceneEdge[], ids: ReadonlySet<string>): readonly SceneEdge[] {
  return edges.filter((edge) => ids.has(edge.from.nodeId) && ids.has(edge.to.nodeId));
}

function insertPoints(
  spots: readonly InsertSpot[],
  entering: ReadonlyMap<string, string>,
): readonly InsertPoint[] {
  return spots.map((spot) => {
    const anchor = spot.before ?? spot.after ?? spot.slotId ?? spot.scope;
    return {
      id: `insert:${spot.scope}:${String(spot.index)}:${spot.placement}:${anchor}`,
      scope: spot.scope,
      index: spot.index,
      placement: spot.placement,
      edgeId:
        spot.placement === 'edge' && spot.before !== null
          ? (entering.get(spot.before) ?? null)
          : null,
      slotId: spot.slotId,
      after: spot.after,
      before: spot.before,
      x: spot.x,
      y: spot.y,
    };
  });
}

function loopReturns(tree: Tree, ids: ReadonlySet<string>): readonly LoopReturn[] {
  const out: LoopReturn[] = [];
  const walk = (lane: Lane): void => {
    for (const item of lane.items) {
      for (const child of item.lanes) {
        if (child.loopLabel !== null && ids.has(child.id)) {
          out.push({
            id: `loop:${child.id}`,
            nodeId: item.draft.id,
            laneId: child.id,
            label: child.loopLabel,
          });
        }
        walk(child);
      }
    }
  };
  walk(tree.body);
  if (tree.failure !== null) walk(tree.failure);
  return out;
}

export function projectScene(program: Program, input: SceneInput): Scene {
  const compact = input.mode === 'compact';
  const tree = buildTree(program, input);
  const layouted = compact
    ? layoutCompact(tree, input.canvasWidth ?? DEFAULT_COMPACT_WIDTH)
    : layoutWide(tree, input.layout);
  const nodes = sceneNodes(tree, layouted, compact);
  const ids = new Set(nodes.map((node) => node.id));
  const exec = execEdgesOf(tree, compact);
  const wires = compact ? [] : present(tree.edges, ids);
  return {
    version: 1,
    mode: input.mode,
    width: Math.max(1, layouted.width),
    height: Math.max(1, layouted.height),
    nodes: [...nodes],
    edges: [...present(exec.edges, ids), ...wires],
    insertPoints: [...insertPoints(layouted.inserts, exec.entering)],
    loopReturns: [...loopReturns(tree, ids)],
  };
}
