import { execClassOf } from '@smarteverything/domain';
import type { PostDomGraph } from './postdom';
import { END, outputsOf, type ExecGraph, type Membership, type Region } from './regions';

export function regionGraph(
  graph: ExecGraph,
  membership: Membership,
  region: Region,
): PostDomGraph {
  const exit = pathExit(membership, region);
  const members = new Set(region.members);
  const inside = (target: string | undefined): string =>
    target !== undefined && (members.has(target) || target === exit) ? target : END;
  const edges = (key: string): readonly string[] => {
    const node = graph.byKey.get(key);
    if (node === undefined || execClassOf(node.kind, graph.kinds) === 'terminal') return [];
    if (execClassOf(node.kind, graph.kinds) === 'fork') return [inside(membership.joinOf.get(key))];
    return outputsOf(graph, key)
      .filter((out) => out.role !== 'lane')
      .map((out) => inside(out.target));
  };
  const successors = new Map(region.members.map((key) => [key, edges(key)]));
  if (exit !== undefined) successors.set(exit, [END]);
  const arrivals = new Map<string, number>();
  for (const targets of successors.values()) {
    for (const target of targets) arrivals.set(target, (arrivals.get(target) ?? 0) + 1);
  }
  for (const key of region.members) {
    const node = graph.byKey.get(key);
    if (
      node !== undefined &&
      execClassOf(node.kind, graph.kinds) === 'terminal' &&
      (arrivals.get(key) ?? 0) > 1
    ) {
      successors.set(key, [END]);
    }
  }
  return { end: END, successors };
}

export function pathExit(membership: Membership, region: Region): string | undefined {
  if (region.kind !== 'path' || region.owner === undefined) return undefined;
  return membership.joinOf.get(region.owner);
}
