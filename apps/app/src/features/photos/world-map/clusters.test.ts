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

  it('merges discs that overlap on screen into one, summing their photos', () => {
    const fit = fitOf(WORLD_VIEW, { width: 1000, height: 400 });
    const berlin = { ...cluster('u33db', 52.52, 13.4, 4210), placeId: 1 };
    const hamburg = { ...cluster('u1x0e', 53.55, 9.99, 620), placeId: 2 };
    const munich = { ...cluster('u281z', 48.14, 11.58, 512), placeId: 3 };
    const tokyo = { ...cluster('xn76u', 35.68, 139.69, 905), placeId: 4 };
    const marks = clusterMarks([hamburg, tokyo, munich, berlin], fit);
    expect(marks).toHaveLength(2);
    const [germany, japan] = marks;
    if (germany === undefined || japan === undefined) throw new Error('two marks expected');
    expect(germany.cluster.count).toBe(4210 + 620 + 512);
    expect(germany.cluster.placeId).toBeNull();
    expect(germany.cluster.coverItemId).toBe(berlin.coverItemId);
    expect(germany.cluster.geohash).toBe('u');
    expect(germany.key).toBe('u33db+u1x0e+u281z');
    expect(germany.merged).toBe(true);
    expect(japan.merged).toBe(false);
    expect(japan.cluster).toBe(tokyo);
    for (const [index, first] of marks.entries()) {
      for (const second of marks.slice(index + 1)) {
        const gap = Math.hypot(
          first.left + first.radius - second.left - second.radius,
          first.top + first.radius - second.top - second.radius,
        );
        expect(gap).toBeGreaterThanOrEqual(first.radius + second.radius);
      }
    }
  });
});
