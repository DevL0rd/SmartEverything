import type { PlaceCluster } from '@smarteverything/domain';
import { compact, count } from '../../../format/number';
import { placeOf, type MapFit } from './projection';

export const CLUSTER_RADIUS_SMALLEST = 11;
export const CLUSTER_RADIUS_LARGEST = 22;
const GROUPED_DIGITS_FIT = 10_000;
export const CLUSTER_TARGET = 44;

export interface ClusterMark {
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

export function clusterMarks(
  clusters: readonly PlaceCluster[],
  fit: MapFit,
): readonly ClusterMark[] {
  const most = clusters.reduce((top, cluster) => Math.max(top, cluster.count), 0);
  return [...clusters]
    .sort((a, b) => b.count - a.count)
    .map((cluster) => {
      const radius = clusterRadius(cluster.count, most);
      const size = radius * 2;
      const at = placeOf(cluster, fit);
      return {
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
