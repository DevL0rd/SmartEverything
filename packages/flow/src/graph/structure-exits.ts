import {
  execClassOf,
  type ExecOutput,
  type FlowNode,
  type GraphNode,
  type Scope,
} from '@smarteverything/domain';
import type { GraphProblem } from './problem-types';
import { END, outputsOf, type ExecGraph, type Wire } from './regions';
import {
  guardNeedsConditionProblem,
  memoryExitProblem,
  pathNotJoinedProblem,
  switchEarlyEndProblem,
} from './structure-problems';

const NEXT = 'next';
const OTHERWISE = 'otherwise';

export type SitePath = readonly (string | number)[];

export interface LaneRow {
  readonly port: string;
  readonly target: string | undefined;
  readonly exit: string | undefined;
  readonly path: SitePath;
}

export interface ExitSite {
  readonly graph: ExecGraph;
  readonly joinOf: ReadonlyMap<string, string>;
  readonly node: GraphNode;
  readonly base: FlowNode;
  readonly exit: string | undefined;
  readonly path: SitePath;
  readonly problems: GraphProblem[];
  readonly merge: () => string | undefined;
  readonly lane: (row: LaneRow) => Scope;
}

export interface ExitAdvance {
  readonly node: FlowNode | undefined;
  readonly next: string | undefined;
  readonly via: Wire;
}

function successorsOf(site: ExitSite, key: string): readonly (string | undefined)[] {
  const node = site.graph.byKey.get(key);
  if (node === undefined) return [];
  const execClass = execClassOf(node.kind, site.graph.kinds);
  if (execClass === 'terminal') return [];
  if (execClass === 'fork') return [site.joinOf.get(key)];
  return outputsOf(site.graph, key)
    .filter((out) => out.role !== 'lane')
    .map((out) => out.target);
}

function opensToEnd(site: ExitSite, from: string | undefined, goal: string): boolean {
  const seen = new Set<string>();
  const open = (target: string | undefined): boolean => {
    const key = target ?? END;
    if (key === goal) return false;
    if (key === END) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return successorsOf(site, key).some(open);
  };
  return open(from);
}

function reachableFrom(site: ExitSite, from: string | undefined): readonly string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  const queue = [from];
  while (queue.length > 0) {
    const target = queue.shift();
    if (target === undefined || seen.has(target)) continue;
    seen.add(target);
    order.push(target);
    queue.push(...successorsOf(site, target));
  }
  return order;
}

function thenTargetOf(site: ExitSite): string | undefined {
  return outputsOf(site.graph, site.node.key).find((out) => out.port === NEXT)?.target;
}

function twoWayGuard(site: ExitSite, otherwise: string | undefined): ExitAdvance {
  const via = { key: site.node.key, port: OTHERWISE };
  const condition = site.node.ports?.['condition'];
  if (condition === undefined) {
    site.problems.push(guardNeedsConditionProblem(site.node, site.graph.kinds));
    return { node: undefined, next: undefined, via };
  }
  const merge = site.merge();
  const scope = site.lane({
    port: NEXT,
    target: thenTargetOf(site),
    exit: merge,
    path: [...site.path, 'branches', 0, 'scope'],
  });
  const elseScope =
    otherwise === undefined || otherwise === merge
      ? undefined
      : site.lane({
          port: OTHERWISE,
          target: otherwise,
          exit: merge,
          path: [...site.path, 'scopes', 'else'],
        });
  const { ports: _ports, ...rest } = site.base;
  const node: FlowNode = {
    ...rest,
    kind: 'flow.if',
    branches: [{ id: site.node.id, when: condition, scope }],
    ...(elseScope === undefined ? {} : { scopes: { else: elseScope } }),
  };
  return { node, next: merge, via };
}

export function structureGuard(site: ExitSite): ExitAdvance {
  const otherwise = site.node.to?.[OTHERWISE];
  if ((otherwise ?? END) !== (site.exit ?? END)) return twoWayGuard(site, otherwise);
  return {
    node: site.base,
    next: thenTargetOf(site),
    via: { key: site.node.key, port: NEXT },
  };
}

function exitScope(site: ExitSite, out: ExecOutput, then: string | undefined): Scope | undefined {
  if ((out.target ?? END) === (site.exit ?? END)) return undefined;
  if (opensToEnd(site, out.target, then ?? END)) {
    const back = then === undefined ? undefined : site.graph.byKey.get(then);
    site.problems.push(memoryExitProblem(site.node, out, back, site.graph.kinds));
    return undefined;
  }
  return site.lane({
    port: out.port,
    target: out.target,
    exit: then,
    path: [...site.path, 'scopes', out.port],
  });
}

export function exitScopes(site: ExitSite): Record<string, Scope> | undefined {
  const then = thenTargetOf(site);
  const found = outputsOf(site.graph, site.node.key)
    .filter((out) => out.role === 'branch')
    .flatMap((out) => {
      const scope = exitScope(site, out, then);
      return scope === undefined ? [] : [[out.port, scope] as const];
    });
  return found.length === 0 ? undefined : Object.fromEntries(found);
}

export function unjoinedPaths(site: ExitSite, join: GraphNode): readonly GraphProblem[] {
  return outputsOf(site.graph, site.node.key)
    .filter((out) => out.role === 'lane')
    .filter((out) => opensToEnd(site, out.target, join.key))
    .map((out) => pathNotJoinedProblem(site.node, out, join, site.graph.kinds));
}

function nearestShared(
  site: ExitSite,
  targets: readonly (string | undefined)[],
): string | undefined {
  const counts = new Map<string, number>();
  for (const target of targets) {
    for (const key of new Set(reachableFrom(site, target))) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const ordered = reachableFrom(site, site.node.key).filter((key) => (counts.get(key) ?? 0) >= 2);
  return ordered[0];
}

function mode(site: ExitSite): unknown {
  const value = site.node.ports?.['mode'];
  return value !== undefined && 'lit' in value ? value.lit : undefined;
}

export function switchEarlyEnd(site: ExitSite): GraphProblem | undefined {
  if (mode(site) !== 'all') return undefined;
  const cases = outputsOf(site.graph, site.node.key).filter((out) => out.role === 'branch');
  const sharedKey = nearestShared(
    site,
    cases.map((out) => out.target),
  );
  const shared = sharedKey === undefined ? undefined : site.graph.byKey.get(sharedKey);
  if (sharedKey === undefined || shared === undefined) return undefined;
  const early = cases.find((out) => opensToEnd(site, out.target, sharedKey));
  return early === undefined
    ? undefined
    : switchEarlyEndProblem(site.node, early, shared, site.graph.kinds);
}
