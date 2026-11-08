import type { GraphNode } from '@smarteverything/domain';
import type { ExecGraph, Membership, Region } from '@smarteverything/flow/graph/regions';
import type { GraphSceneEdge } from './scene-contract';
import { pathLabel } from './scene-titles';

function pathRegionOf(
  membership: Membership,
  sourceKey: string,
  joinKey: string,
): Region | undefined {
  let regionId = membership.regionOf.get(sourceKey);
  while (regionId !== undefined) {
    const region = membership.regions.get(regionId);
    if (region === undefined) return undefined;
    const owner = region.owner;
    if (region.kind === 'path' && owner !== undefined && membership.joinOf.get(owner) === joinKey) {
      return region;
    }
    regionId = region.parent;
  }
  return undefined;
}

function pathName(fork: GraphNode | undefined, entry: string | undefined): string | undefined {
  return fork?.paths?.find((path) => path.to === entry)?.name;
}

export function laneOf(
  graph: ExecGraph,
  membership: Membership,
  source: GraphNode,
  join: GraphNode,
): string | null {
  const region = pathRegionOf(membership, source.key, join.key);
  const owner = region?.owner;
  const name =
    region === undefined || owner === undefined
      ? undefined
      : pathName(graph.byKey.get(owner), region.entry);
  return name === undefined ? null : pathLabel(name);
}

export function withLanes(
  edges: readonly GraphSceneEdge[],
  facts: { readonly graph: ExecGraph; readonly membership: Membership },
  nodeOf: (id: string) => GraphNode | undefined,
): readonly GraphSceneEdge[] {
  const joins = new Set(facts.membership.joinOf.values());
  return edges.map((edge) => {
    const target = nodeOf(edge.target.nodeId);
    const source = nodeOf(edge.source.nodeId);
    if (edge.kind !== 'exec' || target === undefined || source === undefined) return edge;
    if (!joins.has(target.key)) return edge;
    const lane = laneOf(facts.graph, facts.membership, source, target);
    return lane === null ? edge : { ...edge, lane };
  });
}
