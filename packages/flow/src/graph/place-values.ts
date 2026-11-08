import {
  appendTo,
  execClassOf,
  isExecNode,
  type FlowNode,
  type NodeKindLookup,
  type Scope,
} from '@smarteverything/domain';
import { entryReferences, portValueReferences, programLevelReferences } from '../check/references';
import type { PortReference } from '../check/references';
import { defaultScopeOutputs } from '../check/visibility';
import { COLLECT_PORT } from '../compile/reads';
import { indexProgram, type NodeEntry } from '../program/lookup';
import { formatChildPart, type ChildPart } from '../program/paths';
import {
  childScopeRefs,
  rootScopes,
  type Program,
  type ScopeRef,
  type StoragePath,
} from '../program/walk';
import {
  pathKey,
  type PathSegment,
  type StructureMap,
  type StructureMapEntry,
  type StructureResult,
} from './structure';

type StructureOk = Extract<StructureResult, { readonly ok: true }>;

export interface PlacedTree {
  readonly tree: Program;
  readonly map: StructureMap;
}

interface Level {
  readonly scope: string;
  readonly index: number;
}

type Chain = readonly Level[];

type Consumer = { readonly chain: Chain } | { readonly value: string };

interface Site {
  readonly entry: NodeEntry;
  readonly chain: Chain;
}

interface Analysis {
  readonly sites: ReadonlyMap<string, Site>;
  readonly values: ReadonlyMap<string, FlowNode>;
  readonly consumers: ReadonlyMap<string, readonly Consumer[]>;
  readonly memo: Map<string, Chain>;
  readonly open: Set<string>;
}

interface Slot {
  readonly index: number;
  readonly value: FlowNode;
}

interface Created {
  readonly path: StoragePath;
  readonly node: FlowNode;
  readonly port: string;
}

const BODY_START: Chain = [{ scope: pathKey(['body']), index: 0 }];

const FALLBACK_SCOPE: Readonly<Record<string, string>> = {
  'flow.if': 'else',
  'flow.switch': 'default',
};

function chainOf(storage: StoragePath): Chain {
  const levels: Level[] = [];
  storage.forEach((segment, position) => {
    const index = storage[position + 1];
    if (segment === 'nodes' && typeof index === 'number') {
      levels.push({ scope: pathKey(storage.slice(0, position)), index });
    }
  });
  return levels;
}

function matchesScopeKey(part: ChildPart, key: string): boolean {
  return formatChildPart(part) === key || (part.kind !== 'scope' && part.id === key);
}

function laneEnd(site: Site, match: (part: ChildPart) => boolean, index: number): Chain {
  const lane = childScopeRefs(site.entry.node, site.entry.storage).find(
    (ref) => ref.path.t === 'child' && match(ref.path.part),
  );
  return lane === undefined ? site.chain : [...site.chain, { scope: pathKey(lane.storage), index }];
}

function referenceChain(site: Site, reference: PortReference): Chain {
  const at = reference.site;
  if (at.kind === 'output')
    return laneEnd(site, (part) => matchesScopeKey(part, at.scope), Infinity);
  const collects = at.kind === 'port' && at.port === COLLECT_PORT;
  if (!collects || site.entry.node.kind !== 'flow.for_each') return site.chain;
  return laneEnd(site, (part) => part.kind === 'scope' && part.name === 'body', Infinity);
}

function hasOutputFor(node: FlowNode, port: string): boolean {
  return (node.outputs ?? []).some((out) => port in out.values);
}

function ensureFallbackScopes(entries: readonly NodeEntry[]): readonly Created[] {
  const created: Created[] = [];
  for (const { node, storage } of entries) {
    const port = FALLBACK_SCOPE[node.kind];
    const wanted = port !== undefined && hasOutputFor(node, port);
    if (!wanted || node.scopes?.[port] !== undefined) continue;
    node.scopes = { ...node.scopes, [port]: { nodes: [] } };
    created.push({ path: [...storage, 'scopes', port], node, port });
  }
  return created;
}

function programConsumers(program: Program): readonly PortReference[] {
  const triggers = 'triggers' in program ? program.triggers : [];
  const watched = triggers.flatMap((trigger) =>
    Object.values(trigger.ports).flatMap((value) =>
      portValueReferences(value).map((wire): PortReference => ({
        ...wire,
        site: { kind: 'admit' },
      })),
    ),
  );
  return [...programLevelReferences(program), ...watched];
}

function consumersOf(
  program: Program,
  sites: ReadonlyMap<string, Site>,
  values: ReadonlyMap<string, FlowNode>,
): ReadonlyMap<string, readonly Consumer[]> {
  const found = new Map<string, Consumer[]>();
  for (const site of sites.values()) {
    for (const reference of entryReferences(site.entry)) {
      appendTo(found, reference.from, { chain: referenceChain(site, reference) });
    }
  }
  for (const reference of programConsumers(program)) {
    appendTo(found, reference.from, { chain: BODY_START });
  }
  for (const value of values.values()) {
    for (const wire of valueWires(value)) appendTo(found, wire.from, { value: value.key });
  }
  return found;
}

function valueWires(value: FlowNode): readonly { readonly from: string; readonly port: string }[] {
  return Object.values(value.ports ?? {}).flatMap(portValueReferences);
}

function commonChain(chains: readonly Chain[]): Chain | undefined {
  const [first] = chains;
  if (first === undefined) return undefined;
  let depth = 0;
  while (
    depth < first.length &&
    chains.every((chain) => chain[depth]?.scope === first[depth]?.scope)
  ) {
    depth += 1;
  }
  const level = first[depth - 1];
  if (level === undefined) return undefined;
  const index = Math.min(...chains.map((chain) => chain[depth - 1]?.index ?? Infinity));
  return [...first.slice(0, depth - 1), { scope: level.scope, index }];
}

function ownerLanes(analysis: Analysis, wire: { from: string; port: string }): readonly Chain[] {
  const site = analysis.sites.get(wire.from);
  if (site === undefined) return [];
  const lane = childScopeRefs(site.entry.node, site.entry.storage).find(
    (ref) =>
      ref.path.t === 'child' &&
      defaultScopeOutputs(site.entry.node.kind, ref.path.part).includes(wire.port),
  );
  return lane === undefined ? [] : [[...site.chain, { scope: pathKey(lane.storage), index: 0 }]];
}

function reachedWires(analysis: Analysis, key: string): readonly { from: string; port: string }[] {
  const seen = new Set<string>();
  const visit = (current: string): { from: string; port: string }[] => {
    const value = analysis.values.get(current);
    if (value === undefined || seen.has(current)) return [];
    seen.add(current);
    return valueWires(value).flatMap((wire) => [wire, ...visit(wire.from)]);
  };
  return visit(key);
}

function freeChain(analysis: Analysis, key: string): Chain {
  const lanes = reachedWires(analysis, key).flatMap((wire) => ownerLanes(analysis, wire));
  const deepest = [...lanes].sort((left, right) => right.length - left.length)[0];
  return deepest ?? BODY_START;
}

function positionOf(analysis: Analysis, key: string): Chain {
  const known = analysis.memo.get(key);
  if (known !== undefined) return known;
  analysis.open.add(key);
  const chains = (analysis.consumers.get(key) ?? []).flatMap((consumer) => {
    if ('chain' in consumer) return [consumer.chain];
    return analysis.open.has(consumer.value) ? [] : [positionOf(analysis, consumer.value)];
  });
  analysis.open.delete(key);
  const placed =
    chains.length === 0 ? freeChain(analysis, key) : (commonChain(chains) ?? BODY_START);
  analysis.memo.set(key, placed);
  return placed;
}

function byKey(left: FlowNode, right: FlowNode): number {
  if (left.key === right.key) return 0;
  return left.key < right.key ? -1 : 1;
}

function orderGroup(group: readonly FlowNode[]): readonly FlowNode[] {
  const keys = new Set(group.map((value) => value.key));
  const needs = (value: FlowNode): readonly string[] =>
    valueWires(value)
      .map((wire) => wire.from)
      .filter((from) => keys.has(from) && from !== value.key);
  const pending = [...group].sort(byKey);
  const done: FlowNode[] = [];
  while (pending.length > 0) {
    const ready = pending.findIndex((value) =>
      needs(value).every((from) => done.some((placed) => placed.key === from)),
    );
    const [next] = pending.splice(Math.max(ready, 0), 1);
    if (next !== undefined) done.push(next);
  }
  return done;
}

function scopeTable(program: Program): ReadonlyMap<string, ScopeRef> {
  const table = new Map<string, ScopeRef>();
  const visit = (ref: ScopeRef): void => {
    table.set(pathKey(ref.storage), ref);
    ref.scope.nodes.forEach((node, index) => {
      childScopeRefs(node, [...ref.storage, 'nodes', index]).forEach(visit);
    });
  };
  rootScopes(program).forEach(visit);
  return table;
}

interface Insertion {
  readonly inserted: Map<string, readonly number[]>;
  readonly valuePaths: Map<string, StoragePath>;
}

function insertInto(ref: ScopeRef, slots: readonly Slot[], into: Insertion): FlowNode[] {
  const groups = new Map<number, FlowNode[]>();
  for (const slot of slots) appendTo(groups, slot.index, slot.value);
  const nodes: FlowNode[] = [];
  const put = (index: number): void => {
    for (const value of orderGroup(groups.get(index) ?? [])) {
      into.valuePaths.set(value.key, [...ref.storage, 'nodes', nodes.length]);
      nodes.push(value);
    }
  };
  ref.scope.nodes.forEach((node, index) => {
    put(index);
    nodes.push(node);
  });
  put(Infinity);
  into.inserted.set(
    pathKey(ref.storage),
    slots.map((slot) => slot.index),
  );
  return nodes;
}

function shiftPath(path: readonly PathSegment[], inserted: Insertion['inserted']): PathSegment[] {
  return path.map((segment, position) => {
    if (path[position - 1] !== 'nodes' || typeof segment !== 'number') return segment;
    const before = inserted.get(pathKey(path.slice(0, position - 1))) ?? [];
    return segment + before.filter((slot) => slot <= segment).length;
  });
}

function mapEntry(path: readonly PathSegment[], node: FlowNode, port?: string): StructureMapEntry {
  return { path, nodeId: node.id, key: node.key, ...(port === undefined ? {} : { port }) };
}

function updatedMap(
  map: StructureMap,
  into: Insertion,
  extra: { readonly created: readonly Created[]; readonly values: ReadonlyMap<string, FlowNode> },
): StructureMap {
  const next = new Map<string, StructureMapEntry>();
  const add = (entry: StructureMapEntry): void => {
    next.set(pathKey(entry.path), entry);
  };
  for (const entry of map.values()) add({ ...entry, path: shiftPath(entry.path, into.inserted) });
  for (const made of extra.created) {
    add(mapEntry(shiftPath(made.path, into.inserted), made.node, made.port));
  }
  for (const [key, path] of into.valuePaths) {
    const value = extra.values.get(key);
    if (value !== undefined) add(mapEntry(path, value));
  }
  return next;
}

function placeInto(
  work: Program,
  values: readonly FlowNode[],
  map: StructureMap,
  kinds: NodeKindLookup,
): PlacedTree {
  const index = indexProgram(work);
  const created = ensureFallbackScopes(index.nodes);
  const sites = new Map(
    index.nodes
      .filter((entry) => isExecNode(entry.node.kind, kinds))
      .map((entry): [string, Site] => [entry.node.key, { entry, chain: chainOf(entry.storage) }]),
  );
  const byValueKey = new Map(values.map((value) => [value.key, value]));
  const analysis: Analysis = {
    sites,
    values: byValueKey,
    consumers: consumersOf(work, sites, byValueKey),
    memo: new Map(),
    open: new Set(),
  };
  const slots = new Map<string, Slot[]>();
  for (const value of values) {
    const level = positionOf(analysis, value.key).at(-1);
    if (level !== undefined) appendTo(slots, level.scope, { index: level.index, value });
  }
  const into: Insertion = { inserted: new Map(), valuePaths: new Map() };
  const table = scopeTable(work);
  for (const [scope, group] of slots) {
    const ref = table.get(scope);
    if (ref !== undefined) ref.scope.nodes = insertInto(ref, group, into);
  }
  return { tree: work, map: updatedMap(map, into, { created, values: byValueKey }) };
}

export function placeValues(result: StructureOk, kinds: NodeKindLookup): PlacedTree {
  return placeInto(structuredClone(result.tree), result.values, result.map, kinds);
}

function dropEmptyFallbacks(work: Program): void {
  for (const { node } of indexProgram(work).nodes) {
    const port = FALLBACK_SCOPE[node.kind];
    const scope = port === undefined ? undefined : node.scopes?.[port];
    if (port === undefined || scope === undefined) continue;
    if (scope.nodes.length > 0 || hasOutputFor(node, port)) continue;
    const { [port]: _dropped, ...rest } = node.scopes ?? {};
    if (Object.keys(rest).length === 0) delete node.scopes;
    else node.scopes = rest;
  }
}

function extractValues(work: Program, kinds: NodeKindLookup): readonly FlowNode[] {
  const found: FlowNode[] = [];
  for (const ref of scopeTable(work).values()) {
    ref.scope.nodes = ref.scope.nodes.filter((node) => {
      if (isExecNode(node.kind, kinds)) return true;
      found.push(node);
      return false;
    });
  }
  return found;
}

function branchScopes(node: FlowNode): readonly (Scope | undefined)[] {
  const port = FALLBACK_SCOPE[node.kind];
  if (port === undefined) return [];
  const rows = node.kind === 'flow.if' ? node.branches : node.cases;
  return [...(rows ?? []).map((row) => row.scope), node.scopes?.[port]];
}

function completes(scope: Scope | undefined, kinds: NodeKindLookup): boolean {
  return scope === undefined || scope.nodes.every((node) => nodeCompletes(node, kinds));
}

function nodeCompletes(node: FlowNode, kinds: NodeKindLookup): boolean {
  if (execClassOf(node.kind, kinds) === 'terminal') return false;
  const branches = branchScopes(node);
  return branches.length === 0 || branches.some((scope) => completes(scope, kinds));
}

function hoistStopped(node: FlowNode, kinds: NodeKindLookup): readonly FlowNode[] {
  const open = branchScopes(node).filter((scope) => completes(scope, kinds));
  const [only] = open;
  if (open.length !== 1 || only === undefined) return [];
  const moved = only.nodes;
  only.nodes = [];
  return moved;
}

function hoistInScope(ref: ScopeRef, kinds: NodeKindLookup): void {
  const { scope } = ref;
  scope.nodes = scope.nodes.flatMap((node) => {
    for (const child of childScopeRefs(node, [])) hoistInScope(child, kinds);
    return [node, ...hoistStopped(node, kinds)];
  });
}

export function canonicalise(tree: Program, kinds: NodeKindLookup): Program {
  const work = structuredClone(tree);
  const values = extractValues(work, kinds);
  rootScopes(work).forEach((ref) => {
    hoistInScope(ref, kinds);
  });
  dropEmptyFallbacks(work);
  return placeInto(work, values, new Map(), kinds).tree;
}
