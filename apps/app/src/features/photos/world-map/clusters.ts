import type { PlaceCluster } from '@smarteverything/domain';
import { compact, count } from '../../../format/number';
import { placeOf, type MapFit } from './projection';

export const CLUSTER_RADIUS_SMALLEST = 11;
export const CLUSTER_RADIUS_LARGEST = 22;
const GROUPED_DIGITS_FIT = 10_000;
export const CLUSTER_TARGET = 44;

export interface ClusterMark {
  readonly key: string;
  readonly merged: boolean;
  readonly cluster: PlaceCluster;
  readonly left: number;
  readonly top: number;
  readonly size: number;
  readonly radius: number;
  readonly label: string;
  readonly description: string;
}

export function clusterRadius(value: number, most: number): number {
  const share = most > 0 ? Math.sqrt(value / most) : 0;
  return CLUSTER_RADIUS_SMALLEST + (CLUSTER_RADIUS_LARGEST - CLUSTER_RADIUS_SMALLEST) * share;
}

export function clusterLabel(value: number): string {
  return value < GROUPED_DIGITS_FIT ? count(value) : compact(value);
}

export function clusterDescription(value: number): string {
  return `${count(value)} ${value === 1 ? 'photo' : 'photos'} here`;
}

interface Pile {
  readonly members: readonly PlaceCluster[];
  readonly lat: number;
  readonly lon: number;
  readonly count: number;
}

function pileOf(cluster: PlaceCluster): Pile {
  return { members: [cluster], lat: cluster.lat, lon: cluster.lon, count: cluster.count };
}

function joined(first: Pile, second: Pile): Pile {
  const total = first.count + second.count;
  return {
    members: [...first.members, ...second.members],
    lat: (first.lat * first.count + second.lat * second.count) / total,
    lon: (first.lon * first.count + second.lon * second.count) / total,
    count: total,
  };
}

function overlaps(first: Pile, second: Pile, fit: MapFit, most: number): boolean {
  const a = placeOf(first, fit);
  const b = placeOf(second, fit);
  const reach = clusterRadius(first.count, most) + clusterRadius(second.count, most);
  return Math.hypot(a.x - b.x, a.y - b.y) < reach;
}

function mergedOnce(piles: readonly Pile[], fit: MapFit): readonly Pile[] {
  const most = piles.reduce((top, pile) => Math.max(top, pile.count), 0);
  const kept: Pile[] = [];
  for (const pile of piles) {
    const hit = kept.findIndex((other) => overlaps(other, pile, fit, most));
    const other = kept[hit];
    if (other === undefined) kept.push(pile);
    else kept[hit] = joined(other, pile);
  }
  return kept;
}

function sharedPrefix(hashes: readonly string[]): string {
  const [first = ''] = hashes;
  let length = first.length;
  for (const hash of hashes) {
    while (!hash.startsWith(first.slice(0, length))) length -= 1;
  }
  return first.slice(0, length);
}

function clusterOfPile(pile: Pile): PlaceCluster {
  const [largest, ...rest] = pile.members;
  if (largest === undefined) throw new Error('A map pile has no clusters');
  if (rest.length === 0) return largest;
  return {
    geohash: sharedPrefix(pile.members.map((member) => member.geohash)),
    lat: pile.lat,
    lon: pile.lon,
    count: pile.count,
    coverItemId: largest.coverItemId,
    placeId: null,
  };
}

function byCount(piles: readonly Pile[]): readonly Pile[] {
  return [...piles].sort((a, b) => b.count - a.count);
}

export function mergedClusters(
  clusters: readonly PlaceCluster[],
  fit: MapFit,
): readonly (readonly [string, PlaceCluster, boolean])[] {
  let piles = byCount(clusters.map(pileOf));
  let next = mergedOnce(piles, fit);
  while (next.length !== piles.length) {
    piles = byCount(next);
    next = mergedOnce(piles, fit);
  }
  return piles.map((pile) => [
    pile.members.map((member) => member.geohash).join('+'),
    clusterOfPile(pile),
    pile.members.length > 1,
  ]);
}

export function clusterMarks(
  clusters: readonly PlaceCluster[],
  fit: MapFit,
): readonly ClusterMark[] {
  const merged = mergedClusters(clusters, fit);
  const most = merged.reduce((top, [, cluster]) => Math.max(top, cluster.count), 0);
  return merged.map(([key, cluster, joined]) => {
    const radius = clusterRadius(cluster.count, most);
    const size = radius * 2;
    const at = placeOf(cluster, fit);
    return {
      key,
      merged: joined,
      cluster,
      left: at.x - size / 2,
      top: at.y - size / 2,
      size,
      radius,
      label: clusterLabel(cluster.count),
      description: clusterDescription(cluster.count),
    };
  });
}

export interface ClusterTarget {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export function clusterTarget(mark: ClusterMark): ClusterTarget {
  const side = Math.max(CLUSTER_TARGET, mark.size);
  const inset = (side - mark.size) / 2;
  return { left: mark.left - inset, top: mark.top - inset, width: side, height: side };
}
