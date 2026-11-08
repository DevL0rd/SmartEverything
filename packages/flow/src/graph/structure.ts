import {
  execClassOf,
  isExecNode,
  type AutomationV3,
  type CatchRow,
  type ExecClass,
  type ExecOutput,
  type FlowNode,
  type FunctionV3,
  type GraphNode,
  type NodeKindLookup,
  type ProgramV4,
  type Scope,
} from '@smarteverything/domain';
import { immediatePostDominators } from './postdom';
import { pathExit, regionGraph } from './region-graph';
import { sharedBranchNodeProblem, wireText, type GraphProblem } from './problem-types';
import {
  END,
  execGraphOf,
  laneRegionId,
  membershipOf,
  outputsOf,
  unknownTargets,
  type ExecGraph,
  type Membership,
  type Region,
  type Wire,
} from './regions';
import { wireCycles } from './wire-cycles';
import {
  exitScopes,
  structureGuard,
  switchEarlyEnd,
  unjoinedPaths,
  type ExitSite,
} from './structure-exits';
import { flowBase, treeOf } from './tree-of';
import { execIntoRoots, loopControlOutside, sharedShapeOf } from './structure-problems';

export type PathSegment = string | number;

export interface StructureMapEntry {
  readonly path: readonly PathSegment[];
  readonly nodeId: string;
  readonly key: string;
  readonly port?: string;
}

export type StructureMap = ReadonlyMap<string, StructureMapEntry>;

export type StructureResult =
  | {
      readonly ok: true;
      readonly tree: AutomationV3 | FunctionV3;
      readonly map: StructureMap;
      readonly values: readonly FlowNode[];
    }
  | { readonly ok: false; readonly problems: readonly GraphProblem[] };

interface Ctx {
  readonly kinds: NodeKindLookup;
  readonly graph: ExecGraph;
  readonly membership: Membership;
  readonly visited: Map<string, Wire>;
  readonly problems: GraphProblem[];
  readonly map: Map<string, StructureMapEntry>;
  readonly dominators: Map<string, ReadonlyMap<string, string>>;
}

interface Part {
  readonly region: Region;
  readonly exit: string | undefined;
  readonly path: readonly PathSegment[];
}

interface At {
  readonly part: Part;
  readonly node: GraphNode;
  readonly path: readonly PathSegment[];
}

interface Advance {
  readonly node: FlowNode | undefined;
  readonly next: string | undefined;
  readonly via: Wire;
}

type Handler = (ctx: Ctx, at: At) => Advance;

const NEXT = 'next';
const TIMED_OUT = 'timedOut';
const PATH_PREFIX = 'path:';
const CATCH_PREFIX = 'catch:';

export function pathKey(path: readonly PathSegment[]): string {
  return JSON.stringify(path);
}

function record(ctx: Ctx, path: readonly PathSegment[], node: GraphNode, port?: string): void {
  const entry: StructureMapEntry = {
    path,
    nodeId: node.id,
    key: node.key,
    ...(port === undefined ? {} : { port }),
  };
  ctx.map.set(pathKey(path), entry);
}

function thenTarget(ctx: Ctx, node: GraphNode): string | undefined {
  return outputsOf(ctx.graph, node.key).find((out) => out.port === NEXT)?.target;
}

function halt(at: At): Advance {
  return { node: undefined, next: undefined, via: { key: at.node.key, port: NEXT } };
}

function wireTextAt(ctx: Ctx, wire: Wire): string {
  const node = ctx.graph.byKey.get(wire.key);
  return node === undefined ? wire.key : wireText(node, wire.port, ctx.kinds);
}

function siteOf(ctx: Ctx, at: At): ExitSite {
  return {
    graph: ctx.graph,
    joinOf: ctx.membership.joinOf,
    node: at.node,
    base: flowBase(at.node),
    exit: at.part.exit,
    path: at.path,
    problems: ctx.problems,
    merge: () => mergeOf(ctx, at),
    lane: (row) =>
      rowScope(ctx, at, row.exit, { port: row.port, target: row.target, path: row.path }),
  };
}

function mergeOf(ctx: Ctx, at: At): string | undefined {
  const region = at.part.region;
  const known = ctx.dominators.get(region.id);
  const dominators =
    known ?? immediatePostDominators(regionGraph(ctx.graph, ctx.membership, region));
  ctx.dominators.set(region.id, dominators);
  const merge = dominators.get(at.node.key);
  return merge === undefined || merge === END ? undefined : merge;
}

function emptyMeansAbsent(kinds: NodeKindLookup, node: GraphNode, port: string): boolean {
  const optional = kinds.get(node.kind)?.scopes?.optional ?? [];
  return optional.includes(port) && port !== TIMED_OUT;
}

function laneScope(ctx: Ctx, at: At, out: ExecOutput): { name: string; scope: Scope } | undefined {
  const region = ctx.membership.regions.get(laneRegionId(at.node.key, out.port));
  if (region === undefined) return undefined;
  const name = out.port.startsWith(PATH_PREFIX) ? out.port.slice(PATH_PREFIX.length) : out.port;
  const path = [...at.path, 'scopes', name];
  const part = { region, exit: pathExit(ctx.membership, region), path };
  const nodes = structureSeq(ctx, part, out.target, { key: at.node.key, port: out.port });
  if (
    nodes.length === 0 &&
    out.target === undefined &&
    emptyMeansAbsent(ctx.kinds, at.node, out.port)
  ) {
    return undefined;
  }
  record(ctx, path, at.node, out.port);
  return { name, scope: { nodes } };
}

function laneScopes(ctx: Ctx, at: At): Record<string, Scope> | undefined {
  const found = outputsOf(ctx.graph, at.node.key)
    .filter((out) => out.role === 'lane' && !out.port.startsWith(CATCH_PREFIX))
    .flatMap((out) => laneScope(ctx, at, out) ?? []);
  return found.length === 0
    ? undefined
    : Object.fromEntries(found.map((lane) => [lane.name, lane.scope]));
}

function catchRows(ctx: Ctx, at: At): CatchRow[] | undefined {
  return at.node.catches?.map((row, index) => {
    const port = `${CATCH_PREFIX}${row.id}`;
    const region = ctx.membership.regions.get(laneRegionId(at.node.key, port));
    const path = [...at.path, 'catches', index, 'scope'];
    const part = { region: region ?? at.part.region, exit: undefined, path };
    const nodes =
      region === undefined ? [] : structureSeq(ctx, part, row.to, { key: at.node.key, port });
    record(ctx, path, at.node, port);
    return {
      id: row.id,
      ...(row.classes === undefined ? {} : { classes: row.classes }),
      scope: { nodes },
    };
  });
}

const structureWithLanes: Handler = (ctx, at) => {
  const scopes = laneScopes(ctx, at);
  const catches = catchRows(ctx, at);
  const node: FlowNode = {
    ...flowBase(at.node),
    ...(catches === undefined ? {} : { catches }),
    ...(scopes === undefined ? {} : { scopes }),
  };
  return { node, next: thenTarget(ctx, at.node), via: { key: at.node.key, port: NEXT } };
};

const structureTerminal: Handler = (_ctx, at) => ({
  node: flowBase(at.node),
  next: undefined,
  via: { key: at.node.key, port: NEXT },
});

const structureFork: Handler = (ctx, at) => {
  const joinKey = ctx.membership.joinOf.get(at.node.key);
  const join = joinKey === undefined ? undefined : ctx.graph.byKey.get(joinKey);
  if (join === undefined) return halt(at);
  ctx.problems.push(...unjoinedPaths(siteOf(ctx, at), join));
  const scopes = laneScopes(ctx, at);
  ctx.visited.set(join.key, { key: at.node.key, port: 'join' });
  const node: FlowNode = { ...flowBase(at.node), ...(scopes === undefined ? {} : { scopes }) };
  return { node, next: thenTarget(ctx, join), via: { key: join.key, port: NEXT } };
};

interface Row {
  readonly port: string;
  readonly target: string | undefined;
  readonly path: readonly PathSegment[];
}

function rowScope(ctx: Ctx, at: At, merge: string | undefined, row: Row): Scope {
  const part = { region: at.part.region, exit: merge, path: row.path };
  const nodes = structureSeq(ctx, part, row.target, { key: at.node.key, port: row.port });
  record(ctx, row.path, at.node, row.port);
  return { nodes };
}

function fallbackScope(
  ctx: Ctx,
  at: At,
  merge: string | undefined,
  port: string,
): Record<string, Scope> | undefined {
  const target = at.node.to?.[port];
  if (target === undefined || target === merge) return undefined;
  const scope = rowScope(ctx, at, merge, { port, target, path: [...at.path, 'scopes', port] });
  return { [port]: scope };
}

const structureIf: Handler = (ctx, at) => {
  const merge = mergeOf(ctx, at);
  const branches = at.node.branches?.map((row, index) => ({
    id: row.id,
    when: row.when,
    scope: rowScope(ctx, at, merge, {
      port: `row:${row.id}`,
      target: row.to,
      path: [...at.path, 'branches', index, 'scope'],
    }),
  }));
  const scopes = fallbackScope(ctx, at, merge, 'else');
  const node: FlowNode = {
    ...flowBase(at.node),
    ...(branches === undefined ? {} : { branches }),
    ...(scopes === undefined ? {} : { scopes }),
  };
  return { node, next: merge, via: { key: at.node.key, port: 'else' } };
};

const structureSwitch: Handler = (ctx, at) => {
  const merge = mergeOf(ctx, at);
  const early = switchEarlyEnd(siteOf(ctx, at));
  if (early !== undefined) ctx.problems.push(early);
  const cases = at.node.cases?.map((row, index) => ({
    id: row.id,
    match: row.match,
    scope: rowScope(ctx, at, merge, {
      port: `case:${row.id}`,
      target: row.to,
      path: [...at.path, 'cases', index, 'scope'],
    }),
  }));
  const scopes = fallbackScope(ctx, at, merge, 'default');
  const node: FlowNode = {
    ...flowBase(at.node),
    ...(cases === undefined ? {} : { cases }),
    ...(scopes === undefined ? {} : { scopes }),
  };
  return { node, next: merge, via: { key: at.node.key, port: 'default' } };
};

const structureGuardNode: Handler = (ctx, at) => structureGuard(siteOf(ctx, at));

const structureMemory: Handler = (ctx, at) => {
  const lanes = structureWithLanes(ctx, at);
  const exits = exitScopes(siteOf(ctx, at));
  if (lanes.node === undefined || exits === undefined) return lanes;
  return { ...lanes, node: { ...lanes.node, scopes: { ...lanes.node.scopes, ...exits } } };
};

const DECISION_HANDLERS: Readonly<Record<string, Handler>> = {
  'flow.if': structureIf,
  'flow.switch': structureSwitch,
  'flow.guard': structureGuardNode,
};

const structureDecision: Handler = (ctx, at) =>
  (DECISION_HANDLERS[at.node.kind] ?? structureMemory)(ctx, at);

const CLASS_HANDLERS: Readonly<Record<ExecClass, Handler>> = {
  start: (_ctx, at) => halt(at),
  failure: (_ctx, at) => halt(at),
  value: (_ctx, at) => halt(at),
  join: (_ctx, at) => halt(at),
  step: structureWithLanes,
  owner: structureWithLanes,
  terminal: structureTerminal,
  fork: structureFork,
  decision: structureDecision,
};

function sharedProblem(ctx: Ctx, node: GraphNode, first: Wire, second: Wire): GraphProblem {
  const shape = sharedShapeOf(ctx.graph, ctx.visited, { first, second });
  return sharedBranchNodeProblem(
    node,
    {
      first: wireTextAt(ctx, first),
      second: { text: wireTextAt(ctx, second), wire: { from: second.key, port: second.port } },
    },
    shape,
    ctx.kinds,
  );
}

function structureSeq(ctx: Ctx, part: Part, entry: string | undefined, from: Wire): FlowNode[] {
  const nodes: FlowNode[] = [];
  let current = entry;
  let via = from;
  while (current !== undefined && current !== part.exit) {
    const node = ctx.graph.byKey.get(current);
    if (node === undefined) break;
    const seen = ctx.visited.get(current);
    if (seen !== undefined) {
      ctx.problems.push(sharedProblem(ctx, node, seen, via));
      break;
    }
    ctx.visited.set(current, via);
    const path = [...part.path, 'nodes', nodes.length];
    const advance = CLASS_HANDLERS[execClassOf(node.kind, ctx.kinds)](ctx, { part, node, path });
    if (advance.node !== undefined) {
      record(ctx, path, node);
      nodes.push(advance.node);
    }
    current = advance.next;
    via = advance.via;
  }
  return nodes;
}

function structureRoot(ctx: Ctx, id: 'body' | 'failure'): Scope | undefined {
  const region = ctx.membership.regions.get(id);
  const root = region?.owner === undefined ? undefined : ctx.graph.byKey.get(region.owner);
  if (region === undefined || root === undefined) return undefined;
  const path = [id === 'body' ? 'body' : 'onFailure'];
  const nodes = structureSeq(ctx, { region, exit: undefined, path }, region.entry, {
    key: root.key,
    port: NEXT,
  });
  record(ctx, path, root, NEXT);
  return { nodes };
}

export function structureProgram(program: ProgramV4, kinds: NodeKindLookup): StructureResult {
  const graph = execGraphOf(program, kinds);
  const rooted = execIntoRoots(graph);
  if (rooted.length > 0) return { ok: false, problems: rooted };
  const early = [...unknownTargets(graph), ...wireCycles(graph)];
  if (early.length > 0) return { ok: false, problems: early };
  const membership = membershipOf(graph);
  if (membership.problems.length > 0) return { ok: false, problems: membership.problems };
  const ctx: Ctx = {
    kinds,
    graph,
    membership,
    visited: new Map(),
    problems: [...loopControlOutside(graph, membership)],
    map: new Map(),
    dominators: new Map(),
  };
  const body = structureRoot(ctx, 'body') ?? { nodes: [] };
  const onFailure = structureRoot(ctx, 'failure');
  if (ctx.problems.length > 0) return { ok: false, problems: ctx.problems };
  return {
    ok: true,
    tree: treeOf(program, body, onFailure),
    map: ctx.map,
    values: program.nodes.filter((node) => !isExecNode(node.kind, kinds)).map(flowBase),
  };
}
