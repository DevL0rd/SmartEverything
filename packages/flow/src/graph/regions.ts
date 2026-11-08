import {
  execClassOf,
  execPortsOf,
  isExecNode,
  type ExecOutput,
  type GraphNode,
  type NodeKindLookup,
  type ProgramV4,
} from '@smarteverything/domain';
import {
  crossesRegionProblem,
  joinMismatchProblem,
  neverRunsProblem,
  nodeName,
  portLabel,
  unknownTargetProblem,
  wireText,
  type GraphProblem,
} from './problem-types';

export const END = '#end';

export interface ExecGraph {
  readonly kinds: NodeKindLookup;
  readonly byKey: ReadonlyMap<string, GraphNode>;
  readonly outputs: ReadonlyMap<string, readonly ExecOutput[]>;
  readonly exec: readonly GraphNode[];
}

export interface Wire {
  readonly key: string;
  readonly port: string;
}

export type RegionKind = 'body' | 'failure' | 'lane' | 'path';

export interface Region {
  readonly id: string;
  readonly kind: RegionKind;
  readonly owner: string | undefined;
  readonly port: string | undefined;
  readonly parent: string | undefined;
  readonly entry: string | undefined;
  readonly members: string[];
  readonly joins: string[];
}

export interface Membership {
  readonly regions: ReadonlyMap<string, Region>;
  readonly regionOf: ReadonlyMap<string, string>;
  readonly joinOf: ReadonlyMap<string, string>;
  readonly problems: readonly GraphProblem[];
}

interface Claim {
  readonly region: string;
  readonly from: Wire;
}

interface Item {
  readonly key: string;
  readonly from: Wire;
}

interface State {
  readonly graph: ExecGraph;
  readonly claims: Map<string, Claim>;
  readonly regions: Map<string, Region>;
  readonly regionOf: Map<string, string>;
  readonly joinOf: Map<string, string>;
  readonly problems: GraphProblem[];
  readonly reported: Set<string>;
}

export function execGraphOf(program: ProgramV4, kinds: NodeKindLookup): ExecGraph {
  const exec = program.nodes.filter((node) => isExecNode(node.kind, kinds));
  return {
    kinds,
    byKey: new Map(program.nodes.map((node) => [node.key, node])),
    outputs: new Map(exec.map((node) => [node.key, execPortsOf(node.kind, node, kinds).outputs])),
    exec,
  };
}

export function outputsOf(graph: ExecGraph, key: string): readonly ExecOutput[] {
  return graph.outputs.get(key) ?? [];
}

export function laneRegionId(owner: string, port: string): string {
  return `${owner}/${port}`;
}

function targetsOf(graph: ExecGraph, key: string): readonly string[] {
  return outputsOf(graph, key).flatMap((out) => (out.target === undefined ? [] : [out.target]));
}

export function unknownTargets(graph: ExecGraph): readonly GraphProblem[] {
  return graph.exec.flatMap((node) =>
    outputsOf(graph, node.key).flatMap((out) => {
      const target = out.target;
      if (target === undefined || graph.outputs.has(target)) return [];
      return [unknownTargetProblem(graph, node, out.port, target)];
    }),
  );
}

interface RegionSpec {
  readonly id: string;
  readonly kind: RegionKind;
  readonly owner?: GraphNode | undefined;
  readonly out?: ExecOutput | undefined;
  readonly parent?: Region | undefined;
  readonly entry: string | undefined;
}

function newRegion(state: State, spec: RegionSpec): Region {
  const region: Region = {
    id: spec.id,
    kind: spec.kind,
    owner: spec.owner?.key,
    port: spec.out?.port,
    parent: spec.parent?.id,
    entry: spec.entry,
    members: [],
    joins: [],
  };
  state.regions.set(spec.id, region);
  return region;
}

function nextItems(graph: ExecGraph, node: GraphNode): readonly Item[] {
  return outputsOf(graph, node.key).flatMap((out) =>
    out.role === 'lane' || out.target === undefined
      ? []
      : [{ key: out.target, from: { key: node.key, port: out.port } }],
  );
}

function wireTextOf(state: State, wire: Wire): string {
  const node = state.graph.byKey.get(wire.key);
  return node === undefined ? wire.key : wireText(node, wire.port, state.graph.kinds);
}

function regionText(state: State, region: Region): string {
  const owner = region.owner === undefined ? undefined : state.graph.byKey.get(region.owner);
  if (owner === undefined || region.port === undefined) {
    return region.kind === 'failure' ? 'On failure' : 'the main flow';
  }
  return `${portLabel(owner, region.port, state.graph.kinds)} of ${nodeName(owner, state.graph.kinds)}`;
}

function laneUnder(state: State, inner: Region, outer: Region): Region | undefined {
  let cursor: Region | undefined = inner;
  while (cursor !== undefined && cursor.parent !== outer.id) {
    cursor = cursor.parent === undefined ? undefined : state.regions.get(cursor.parent);
  }
  return cursor;
}

interface Crossing {
  readonly message: string;
  readonly fix: string;
  readonly wire: { readonly from: string; readonly port: string };
}

function nestedCrossing(
  state: State,
  node: GraphNode,
  lane: Region,
  claims: { readonly inner: Claim; readonly outer: Claim },
): Crossing {
  const owner = state.graph.byKey.get(lane.owner ?? '');
  const ownerName = owner === undefined ? 'its owner' : nodeName(owner, state.graph.kinds);
  if (claims.outer.from.key === lane.owner) {
    const from = claims.inner.from;
    return {
      message: `A path inside ${regionText(state, lane)} leads out to ${nodeName(node, state.graph.kinds)}.`,
      fix: `End the path inside ${ownerName}; the run carries on along its Then.`,
      wire: { from: from.key, port: from.port },
    };
  }
  const from = claims.outer.from;
  return {
    message: `${nodeName(node, state.graph.kinds)} comes in from outside ${ownerName}: ${wireTextOf(state, from)} leads to it.`,
    fix: `Wire it to a step outside ${ownerName}, or keep the path inside it.`,
    wire: { from: from.key, port: from.port },
  };
}

function siblingCrossing(state: State, node: GraphNode, first: Placed, second: Placed): Crossing {
  const sameOwner = first.region.owner !== undefined && first.region.owner === second.region.owner;
  const owner = state.graph.byKey.get(first.region.owner ?? '');
  const both =
    sameOwner && owner !== undefined
      ? `${portLabel(owner, first.region.port ?? '', state.graph.kinds)} and ${regionText(state, second.region)}`
      : `${regionText(state, first.region)} and ${regionText(state, second.region)}`;
  const from = second.claim.from;
  return {
    message: `${nodeName(node, state.graph.kinds)} is reached from both ${both}.`,
    fix: 'Give each path its own steps, or end one of them before the shared step.',
    wire: { from: from.key, port: from.port },
  };
}

interface Placed {
  readonly region: Region;
  readonly claim: Claim;
}

function placedOf(state: State, claimed: Claim): Placed | undefined {
  const region = state.regions.get(claimed.region);
  return region === undefined ? undefined : { region, claim: claimed };
}

function crossingDetail(state: State, node: GraphNode, first: Placed, second: Placed): Crossing {
  const innerFirst = laneUnder(state, first.region, second.region);
  if (innerFirst !== undefined) {
    return nestedCrossing(state, node, innerFirst, { inner: first.claim, outer: second.claim });
  }
  const innerSecond = laneUnder(state, second.region, first.region);
  if (innerSecond !== undefined) {
    return nestedCrossing(state, node, innerSecond, { inner: second.claim, outer: first.claim });
  }
  return siblingCrossing(state, node, first, second);
}

function reportCrossing(state: State, node: GraphNode, before: Claim, now: Claim): void {
  if (state.reported.has(node.key)) return;
  state.reported.add(node.key);
  const first = placedOf(state, before);
  const second = placedOf(state, now);
  if (first === undefined || second === undefined) return;
  state.problems.push(crossesRegionProblem(node, crossingDetail(state, node, first, second)));
}

function claim(state: State, region: Region, node: GraphNode, from: Wire): boolean {
  const existing = state.claims.get(node.key);
  if (existing === undefined) {
    state.claims.set(node.key, { region: region.id, from });
    state.regionOf.set(node.key, region.id);
    region.members.push(node.key);
    return true;
  }
  if (existing.region !== region.id) {
    reportCrossing(state, node, existing, { region: region.id, from });
  }
  return false;
}

interface Lane {
  readonly owner: GraphNode;
  readonly out: ExecOutput;
}

function openLane(state: State, parent: Region, lane: Lane, kind: RegionKind): Region {
  const { owner, out } = lane;
  const spec = {
    id: laneRegionId(owner.key, out.port),
    kind,
    owner,
    out,
    parent,
    entry: out.target,
  };
  const region = newRegion(state, spec);
  collect(state, region, out.target, { key: owner.key, port: out.port });
  return region;
}

function collect(state: State, region: Region, entry: string | undefined, from: Wire): void {
  const pending: Item[] = entry === undefined ? [] : [{ key: entry, from }];
  for (let item = pending.pop(); item !== undefined; item = pending.pop()) {
    pending.push(...[...visit(state, region, item)].reverse());
  }
}

function visit(state: State, region: Region, item: Item): readonly Item[] {
  const node = state.graph.byKey.get(item.key);
  if (node === undefined) return [];
  const execClass = execClassOf(node.kind, state.graph.kinds);
  if (execClass === 'join' && region.kind === 'path') {
    if (!region.joins.includes(node.key)) region.joins.push(node.key);
    return [];
  }
  if (!claim(state, region, node, item.from)) return [];
  if (execClass === 'join') {
    state.problems.push(strayJoin(state, node, item.from));
    return [];
  }
  if (execClass === 'fork') return forkContinuation(state, region, node);
  for (const out of outputsOf(state.graph, node.key)) {
    if (out.role === 'lane') openLane(state, region, { owner: node, out }, 'lane');
  }
  return nextItems(state.graph, node);
}

function strayJoin(state: State, node: GraphNode, from: Wire): GraphProblem {
  return joinMismatchProblem(node, {
    wire: { from: from.key, port: from.port },
    message: `${nodeName(node, state.graph.kinds)} gets a wire from ${wireTextOf(state, from)}, which is not a path of a Do together.`,
    fix: 'Wire only the paths of one Do together into it.',
  });
}

function forkContinuation(state: State, region: Region, fork: GraphNode): readonly Item[] {
  const paths = outputsOf(state.graph, fork.key)
    .filter((out) => out.role === 'lane')
    .map((out) => openLane(state, region, { owner: fork, out }, 'path'));
  const joins = [...new Set(paths.flatMap((path) => path.joins))];
  const [joinKey] = joins;
  const join = joinKey === undefined ? undefined : state.graph.byKey.get(joinKey);
  if (join === undefined || joins.length > 1) {
    state.problems.push(forkWithoutJoin(fork, joins.length, state.graph.kinds));
    return [];
  }
  if ([...state.joinOf.values()].includes(join.key)) {
    state.problems.push(sharedJoin(join, state.graph.kinds));
    return [];
  }
  state.joinOf.set(fork.key, join.key);
  if (!claim(state, region, join, { key: fork.key, port: 'join' })) return [];
  return nextItems(state.graph, join);
}

function forkWithoutJoin(fork: GraphNode, count: number, kinds: NodeKindLookup): GraphProblem {
  const reason =
    count === 0
      ? `${nodeName(fork, kinds)} has no Wait for all: none of its paths lead to one.`
      : `The paths of ${nodeName(fork, kinds)} lead to ${String(count)} different Wait for all steps.`;
  return joinMismatchProblem(fork, {
    message: reason,
    fix: 'Wire the end of its paths into one Wait for all.',
  });
}

function sharedJoin(join: GraphNode, kinds: NodeKindLookup): GraphProblem {
  return joinMismatchProblem(join, {
    message: `${nodeName(join, kinds)} gets wires from the paths of two different Do together steps.`,
    fix: 'Wire only the paths of one Do together into it.',
  });
}

function neverRunning(state: State): readonly GraphProblem[] {
  const { graph } = state;
  const rooted = new Set(['start', 'failure']);
  const wired = new Set(graph.exec.flatMap((node) => targetsOf(graph, node.key)));
  return graph.exec
    .filter(
      (node) => !rooted.has(execClassOf(node.kind, graph.kinds)) && !state.claims.has(node.key),
    )
    .map((node) => neverRunsProblem(node, wired.has(node.key), graph.kinds));
}

function openRoot(state: State, kind: 'body' | 'failure', root: GraphNode | undefined): void {
  if (root === undefined) return;
  const out = outputsOf(state.graph, root.key).find((candidate) => candidate.port === 'next');
  const region = newRegion(state, { id: kind, kind, owner: root, out, entry: out?.target });
  collect(state, region, out?.target, { key: root.key, port: 'next' });
}

export function membershipOf(graph: ExecGraph): Membership {
  const state: State = {
    graph,
    claims: new Map(),
    regions: new Map(),
    regionOf: new Map(),
    joinOf: new Map(),
    problems: [],
    reported: new Set(),
  };
  const rootOf = (kind: string): GraphNode | undefined =>
    graph.exec.find((node) => execClassOf(node.kind, graph.kinds) === kind);
  openRoot(state, 'body', rootOf('start'));
  openRoot(state, 'failure', rootOf('failure'));
  return {
    regions: state.regions,
    regionOf: state.regionOf,
    joinOf: state.joinOf,
    problems: [...state.problems, ...neverRunning(state)],
  };
}
