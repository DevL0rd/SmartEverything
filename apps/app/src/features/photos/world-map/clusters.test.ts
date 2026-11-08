import type { PlaceCluster } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { compact, count } from '../../../format/number';
import {
  CLUSTER_RADIUS_LARGEST,
  CLUSTER_RADIUS_SMALLEST,
  CLUSTER_TARGET,
  clusterDescription,
  clusterLabel,
  clusterMarks,
  clusterRadius,
  clusterTarget,
} from './clusters';
import { fitOf, placeOf, WORLD_VIEW } from './projection';

function cluster(geohash: string, lat: number, lon: number, photos: number): PlaceCluster {
  return { geohash, lat, lon, count: photos, coverItemId: `item-${geohash}`, placeId: null };
}

describe('map clusters', () => {
  it('sizes discs by the square root of their share of the largest cluster', () => {
    expect(clusterRadius(1284, 1284)).toBe(CLUSTER_RADIUS_LARGEST);
    expect(clusterRadius(321, 1284)).toBeCloseTo(
      CLUSTER_RADIUS_SMALLEST + (CLUSTER_RADIUS_LARGEST - CLUSTER_RADIUS_SMALLEST) / 2,
    );
    expect(clusterRadius(1, 1_000_000)).toBeCloseTo(CLUSTER_RADIUS_SMALLEST, 1);
  });

  it('labels counts in full up to four digits and compact above, so the label fits the disc', () => {
    expect(clusterLabel(96)).toBe(count(96));
    expect(clusterLabel(1284)).toBe(count(1284));
    expect(clusterLabel(12_400)).toBe(compact(12_400));
    expect(clusterDescription(1)).toBe('1 photo here');
    expect(clusterDescription(1284)).toBe(`${count(1284)} photos here`);
  });

  it('places each disc centred on its point and draws the largest first', () => {
    const fit = fitOf(WORLD_VIEW, { width: 1000, height: 400 });
    const lisbon = cluster('eyckp', 38.72, -9.14, 1284);
    const tokyo = cluster('xn76u', 35.68, 139.69, 905);
    const marks = clusterMarks([tokyo, lisbon], fit);
    expect(marks.map((mark) => mark.cluster.geohash)).toEqual(['eyckp', 'xn76u']);
    const [first] = marks;
    expect(first).toBeDefined();
    if (first === undefined) return;
    const centre = placeOf(lisbon, fit);
    expect(first.size).toBe(CLUSTER_RADIUS_LARGEST * 2);
    expect(first.left + first.size / 2).toBeCloseTo(centre.x);
    expect(first.top + first.size / 2).toBeCloseTo(centre.y);
    expect(first.label).toBe(count(1284));
    expect(clusterMarks([], fit)).toEqual([]);
  });

  it('gives every disc a tap target of at least 44 points centred on it', () => {
    const fit = fitOf(WORLD_VIEW, { width: 1000, height: 400 });
    const [small] = clusterMarks([cluster('kde2', -33.92, 18.42, 96)], fit);
    expect(small).toBeDefined();
    if (small === undefined) return;
    const target = clusterTarget(small);
    expect(target.width).toBe(Math.max(CLUSTER_TARGET, small.size));
    expect(target.left + target.width / 2).toBeCloseTo(small.left + small.size / 2);
    expect(target.top + target.height / 2).toBeCloseTo(small.top + small.size / 2);
    const big = { ...small, size: 60, left: 10, top: 20 };
    expect(clusterTarget(big)).toEqual({ left: 10, top: 20, width: 60, height: 60 });
  });
});
