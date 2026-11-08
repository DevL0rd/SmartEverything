import {
  execClassOf,
  isExecNode,
  type FlowNode,
  type GraphNode,
  type NodeKindLookup,
  type NodeLayout,
  type ProgramV4,
  type Scope,
} from '@smarteverything/domain';
import type { Program } from '../program/walk';
import { bandHeight, placeBands, type Box, type Extent } from './layout-bands';
import { structuredPart, type Structured } from './layout-prune';
import { valueAnchors, type ValueAnchors } from './layout-values';
import {
  END_CAP_W,
  EXEC_IN_Y,
  GAP,
  HEADER_H,
  ROW_H,
  sizesFor,
  type Density,
  type Direction,
  type Size,
} from './metrics';
import { execGraphOf, membershipOf } from './regions';
import { structuredOf } from './structured-of';

export interface LayoutOptions {
  readonly kinds: NodeKindLookup;
  readonly direction: Direction;
  readonly density?: Density;
  readonly sizes?: ReadonlyMap<string, Size>;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface GraphLayoutResult {
  readonly rects: ReadonlyMap<string, Rect>;
  readonly nodes: Readonly<Record<string, NodeLayout>>;
  readonly remainder: readonly string[];
  readonly problemCount: number;
}

interface Spot {
  readonly m: number;
  readonly c: number;
}

type Emit = (id: string, box: Box) => void;

interface Unit extends Extent {
  readonly above: number;
  readonly put: (at: Spot, emit: Emit) => void;
}

interface Ctx {
  readonly kinds: NodeKindLookup;
  readonly direction: Direction;
  readonly density: Density;
  readonly sizes: ReadonlyMap<string, Size>;
  readonly byKey: ReadonlyMap<string, GraphNode>;
  readonly joinOf: ReadonlyMap<string, string>;
  readonly anchors: ValueAnchors;
}

const EMPTY: Unit = { main: 0, cross: 0, above: 0, put: () => undefined };

function extentOf(ctx: Ctx, id: string): Extent {
  const size = ctx.sizes.get(id);
  if (size === undefined) throw new Error(`layout has no size for node ${id}`);
  return ctx.direction === 'ltr'
    ? { main: size.w, cross: size.h }
    : { main: size.h, cross: size.w };
}

function cardUnit(ctx: Ctx, id: string): Unit {
  const extent = extentOf(ctx, id);
  const values = (ctx.anchors.get(id) ?? []).map((value) => extentOf(ctx, value.id));
  return {
    ...extent,
    above: bandHeight(values),
    put: (spot, emit): void => {
      emit(id, { ...spot, ...extent });
    },
  };
}

function chain(units: readonly Unit[], gap: number): Unit {
  const parts = units.filter((unit) => unit.main > 0 || unit.cross > 0);
  const main =
    parts.reduce((sum, unit) => sum + unit.main, 0) + gap * Math.max(0, parts.length - 1);
  return {
    main,
    cross: Math.max(0, ...parts.map((unit) => unit.cross)),
    above: Math.max(0, ...parts.map((unit) => unit.above)),
    put: (at, emit): void => {
      let cursor = at.m;
      for (const unit of parts) {
        unit.put({ m: cursor, c: at.c }, emit);
        cursor += unit.main + gap;
      }
    },
  };
}

function linesOf(units: readonly Unit[], gap: number, offsets: readonly number[]): number[] {
  const lines: number[] = [];
  let bottom = 0;
  units.forEach((unit, index) => {
    const wanted = offsets[index] ?? 0;
    const line = index === 0 ? wanted : Math.max(wanted, bottom + gap + unit.above);
    lines.push(line);
    bottom = line + unit.cross;
  });
  return lines;
}

function stackAt(units: readonly Unit[], gap: number, offsets: readonly number[]): Unit {
  const lines = linesOf(units, gap, offsets);
  const last = units.length - 1;
  return {
    main: Math.max(0, ...units.map((unit) => unit.main)),
    cross: last < 0 ? 0 : (lines[last] ?? 0) + (units[last]?.cross ?? 0),
    above: units[0]?.above ?? 0,
    put: (at, emit): void => {
      units.forEach((unit, index) => {
        unit.put({ m: at.m, c: at.c + (lines[index] ?? 0) }, emit);
      });
    },
  };
}

function stack(units: readonly Unit[], gap: number): Unit {
  return stackAt(units, gap, []);
}

function indent(unit: Unit, by: number): Unit {
  return {
    ...unit,
    main: unit.main + by,
    put: (at, emit): void => {
      unit.put({ m: at.m + by, c: at.c }, emit);
    },
  };
}

function atLeast(unit: Unit, cross: number): Unit {
  return { ...unit, cross: Math.max(unit.cross, cross) };
}

function lanesOf(node: FlowNode): readonly Scope[] {
  const named = Object.entries(node.scopes ?? {});
  const head = named.filter(([name]) => name === 'try').map(([, scope]) => scope);
  const tail = named.filter(([name]) => name !== 'try').map(([, scope]) => scope);
  const rows = [...(node.branches ?? []), ...(node.cases ?? []), ...(node.catches ?? [])];
  return [...head, ...rows.map((row) => row.scope), ...tail];
}

function sequenceUnit(ctx: Ctx, scope: Scope): Unit {
  const units = scope.nodes
    .filter((node) => isExecNode(node.kind, ctx.kinds))
    .map((node) => execUnit(ctx, node));
  return chain(units, GAP.sequence);
}

function endsInCap(ctx: Ctx, scope: Scope): boolean {
  const nodes = scope.nodes.filter((node) => isExecNode(node.kind, ctx.kinds));
  const last = nodes[nodes.length - 1];
  const graph = last === undefined ? undefined : ctx.byKey.get(last.key);
  if (graph === undefined || execClassOf(graph.kind, ctx.kinds) === 'terminal') return false;
  return graph.to?.['next'] === undefined;
}

function laneUnit(ctx: Ctx, scope: Scope): Unit {
  const unit = atLeast(sequenceUnit(ctx, scope), ROW_H[ctx.density]);
  return endsInCap(ctx, scope) ? { ...unit, main: unit.main + END_CAP_W } : unit;
}

function rowLanes(ctx: Ctx, lanes: readonly Unit[]): Unit {
  if (ctx.direction !== 'ltr') return stack(lanes, GAP.branch);
  const row = ROW_H[ctx.density];
  const offsets = lanes.map((_, index) => HEADER_H + index * row + row / 2 - EXEC_IN_Y);
  return stackAt(lanes, GAP.branch, offsets);
}

function branchesUnit(ctx: Ctx, card: Unit, lanes: readonly Unit[]): Unit {
  const filled = lanes.some((lane) => lane.main > 0);
  return filled ? chain([card, rowLanes(ctx, lanes)], GAP.sequence) : card;
}

function joinUnit(ctx: Ctx, node: FlowNode): Unit {
  const key = ctx.joinOf.get(node.key);
  const join = key === undefined ? undefined : ctx.byKey.get(key);
  return join === undefined ? EMPTY : cardUnit(ctx, join.id);
}

function execUnit(ctx: Ctx, node: FlowNode): Unit {
  const card = cardUnit(ctx, node.id);
  const lanes = lanesOf(node).map((scope) => laneUnit(ctx, scope));
  if (lanes.length === 0) return card;
  const body = branchesUnit(ctx, card, lanes);
  if (execClassOf(node.kind, ctx.kinds) !== 'fork') return body;
  return chain([body, joinUnit(ctx, node)], GAP.sequence);
}

function programUnit(ctx: Ctx, program: ProgramV4, tree: Program): Unit {
  const startNode = program.nodes.find((node) => execClassOf(node.kind, ctx.kinds) === 'start');
  const failureNode = program.nodes.find((node) => execClassOf(node.kind, ctx.kinds) === 'failure');
  const triggers = program.kind === 'automation' ? program.triggers : [];
  const triggerStack = stack(
    triggers.map((trigger) => cardUnit(ctx, trigger.id)),
    GAP.trigger,
  );
  const start = startNode === undefined ? EMPTY : cardUnit(ctx, startNode.id);
  const body = chain([triggerStack, start, sequenceUnit(ctx, tree.body)], GAP.sequence);
  const handler = 'onFailure' in tree ? tree.onFailure : undefined;
  if (failureNode === undefined || handler === undefined) return body;
  const offset = triggerStack.main > 0 ? triggerStack.main + GAP.sequence : 0;
  const row = chain([cardUnit(ctx, failureNode.id), sequenceUnit(ctx, handler)], GAP.sequence);
  return stack([body, indent(row, offset)], GAP.failure);
}

function contextOf(
  found: Structured,
  sizes: ReadonlyMap<string, Size>,
  options: LayoutOptions,
): Ctx {
  const { program, tree } = found;
  const graph = execGraphOf(program, options.kinds);
  const startId = program.nodes.find(
    (node) => execClassOf(node.kind, options.kinds) === 'start',
  )?.id;
  return {
    kinds: options.kinds,
    direction: options.direction,
    density: options.density ?? 'touch',
    sizes,
    byKey: graph.byKey,
    joinOf: membershipOf(graph).joinOf,
    anchors: tree === undefined ? new Map() : valueAnchors(tree, startId, options.kinds),
  };
}

function idsOf(program: ProgramV4): readonly string[] {
  const triggers = program.kind === 'automation' ? program.triggers : [];
  return [...program.nodes.map((node) => node.id), ...triggers.map((trigger) => trigger.id)];
}

function rectOf(direction: Direction, box: Box): Rect {
  return direction === 'ltr'
    ? { x: box.m, y: box.c, w: box.main, h: box.cross }
    : { x: box.c, y: box.m, w: box.cross, h: box.main };
}

function loose(
  boxes: Map<string, Box>,
  ids: readonly string[],
  extent: (id: string) => Extent,
): void {
  const below = Math.max(0, ...[...boxes.values()].map((box) => box.c + box.cross));
  let cursor = 0;
  for (const id of ids) {
    const size = extent(id);
    boxes.set(id, { m: cursor, c: below + GAP.failure, ...size });
    cursor += size.main + GAP.sequence;
  }
}

function normalised(boxes: ReadonlyMap<string, Box>): ReadonlyMap<string, Box> {
  const all = [...boxes.values()];
  const m = Math.min(0, ...all.map((box) => box.m));
  const c = Math.min(0, ...all.map((box) => box.c));
  return new Map([...boxes].map(([id, box]) => [id, { ...box, m: box.m - m, c: box.c - c }]));
}

function boxesOf(ctx: Ctx, unit: Unit, ids: readonly string[]): ReadonlyMap<string, Box> {
  const cards = new Map<string, Box>();
  unit.put({ m: 0, c: unit.above }, (id, box) => {
    cards.set(id, box);
  });
  const values = placeBands(cards, ctx.anchors, (node) => extentOf(ctx, node.id));
  const boxes = new Map([...cards, ...values]);
  loose(
    boxes,
    ids.filter((id) => !boxes.has(id)),
    (id) => extentOf(ctx, id),
  );
  return normalised(boxes);
}

function resultOf(
  ctx: Ctx,
  found: Structured,
  all: { readonly ids: readonly string[]; readonly problemCount: number },
): GraphLayoutResult {
  const unit = found.tree === undefined ? EMPTY : programUnit(ctx, found.program, found.tree);
  const placed = new Set<string>();
  unit.put({ m: 0, c: 0 }, (id) => placed.add(id));
  for (const held of ctx.anchors.values()) for (const value of held) placed.add(value.id);
  const boxes = boxesOf(ctx, unit, all.ids);
  const rects = new Map([...boxes].map(([id, box]) => [id, rectOf(ctx.direction, box)]));
  return {
    rects,
    nodes: Object.fromEntries([...rects].map(([id, rect]) => [id, { x: rect.x, y: rect.y }])),
    remainder: all.ids.filter((id) => !placed.has(id)),
    problemCount: all.problemCount,
  };
}

export function layoutGraph(program: ProgramV4, options: LayoutOptions): GraphLayoutResult {
  const sizes = sizesFor(program, options);
  const outcome = structuredOf(program, options.kinds);
  const problemCount = outcome.kind === 'unstructured' ? outcome.problems.length : 0;
  const found = structuredPart(program, options.kinds);
  const ctx = contextOf(found, sizes, options);
  return resultOf(ctx, found, { ids: idsOf(program), problemCount });
}
