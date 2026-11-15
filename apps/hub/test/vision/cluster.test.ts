import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  assignIncremental,
  centroidOf,
  cosine,
  mergeSuggestions,
  pairKey,
  recluster,
  type ClusterFace,
  type ClusterGroup,
} from '../../src/vision/cluster';
import { FACE_MATCH_THRESHOLD } from '../../src/vision/models';

const SIZE = 16;

function unit(values: readonly number[]): Float32Array {
  const vector = Float32Array.from(values);
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return vector.map((value) => value / norm);
}

function axis(index: number, noise = 0, seed = 0): Float32Array {
  return unit(
    Array.from({ length: SIZE }, (_, at) =>
      at === index ? 1 : noise * Math.sin((seed + 1) * (at + 3) * 12.9898),
    ),
  );
}

function face(id: string, embedding: Float32Array, extra: Partial<ClusterFace> = {}): ClusterFace {
  return {
    id,
    embedding,
    quality: 1,
    groupId: null,
    confirmed: false,
    rejectedGroupIds: new Set(),
    ...extra,
  };
}

function facesOf(
  prefix: string,
  axisIndex: number,
  count: number,
  extra: Partial<ClusterFace> = {},
): ClusterFace[] {
  return Array.from({ length: count }, (_, at) =>
    face(`${prefix}${String(at)}`, axis(axisIndex, 0.15, at), extra),
  );
}

function idsOf(clusters: ReturnType<typeof recluster>): string[][] {
  return clusters
    .map((cluster) => [...cluster.faceIds].sort())
    .sort((a, b) => (a[0] ?? '').localeCompare(b[0] ?? ''));
}

describe('cosine and centroid', () => {
  it('measures angle, with zero vectors at zero', () => {
    expect(cosine(axis(0), axis(0))).toBeCloseTo(1, 6);
    expect(cosine(axis(0), axis(1))).toBeCloseTo(0, 6);
    expect(cosine(new Float32Array(SIZE), axis(0))).toBe(0);
  });

  it('averages by quality and normalises', () => {
    const centroid = centroidOf([
      { embedding: axis(0), quality: 3 },
      { embedding: axis(1), quality: 1 },
    ]);
    expect(cosine(centroid, centroid)).toBeCloseTo(1, 6);
    expect(centroid[0]).toBeGreaterThan(centroid[1] ?? 0);
    expect(
      centroidOf([
        { embedding: axis(0), quality: 0 },
        { embedding: axis(1), quality: 0 },
      ])[0],
    ).toBeCloseTo(centroid.length === 0 ? 0 : Math.SQRT1_2, 6);
    expect(centroidOf([])).toHaveLength(0);
  });
});

describe('incremental assignment', () => {
  const groups: ClusterGroup[] = [
    { id: 'a', centroid: axis(0) },
    { id: 'b', centroid: axis(1) },
  ];

  it('joins the nearest group at or above the threshold', () => {
    expect(assignIncremental(axis(0, 0.1, 2), groups, new Set()).groupId).toBe('a');
    expect(assignIncremental(axis(1, 0.1, 2), groups, new Set()).groupId).toBe('b');
  });

  it('starts a new group when nothing is close enough', () => {
    expect(assignIncremental(axis(5), groups, new Set()).groupId).toBeNull();
  });

  it('never joins a group the face was rejected from', () => {
    expect(assignIncremental(axis(0), groups, new Set(['a'])).groupId).toBeNull();
  });

  it('uses the published threshold by default and honours another', () => {
    const half = unit(Array.from({ length: SIZE }, (_, at) => (at === 0 ? 1 : at === 1 ? 1 : 0)));
    expect(cosine(half, axis(0))).toBeGreaterThan(FACE_MATCH_THRESHOLD);
    expect(assignIncremental(half, groups, new Set(), 0.9).groupId).toBeNull();
  });
});

describe('merge suggestions', () => {
  it('pairs groups whose centroids match, most alike first, skipping dismissed pairs', () => {
    const groups: ClusterGroup[] = [
      { id: 'c', centroid: axis(0) },
      { id: 'a', centroid: axis(0, 0.3, 1) },
      { id: 'b', centroid: axis(0, 0.5, 2) },
      { id: 'z', centroid: axis(9) },
    ];
    const all = mergeSuggestions(groups, new Set());
    expect(all.every((suggestion) => suggestion.groupIds[0] < suggestion.groupIds[1])).toBe(true);
    expect(all.some((suggestion) => suggestion.groupIds.includes('z'))).toBe(false);
    expect(all).toHaveLength(3);
    expect(all.map((suggestion) => suggestion.similarity)).toStrictEqual(
      all.map((suggestion) => suggestion.similarity).toSorted((x, y) => y - x),
    );
    const without = mergeSuggestions(groups, new Set([pairKey('b', 'a')]));
    expect(without).toHaveLength(2);
  });
});

describe('reclustering', () => {
  it('groups faces by identity and leaves strangers alone', () => {
    const clusters = recluster([
      ...facesOf('p', 0, 4),
      ...facesOf('q', 1, 3),
      face('lone', axis(7)),
    ]);
    expect(idsOf(clusters)).toStrictEqual([['lone'], ['p0', 'p1', 'p2', 'p3'], ['q0', 'q1', 'q2']]);
    expect(clusters.every((cluster) => cluster.groupId === null)).toBe(true);
  });

  it('keeps an existing group on the cluster that holds most of its faces', () => {
    const clusters = recluster([
      ...facesOf('p', 0, 3, { groupId: 'old-p' }),
      ...facesOf('q', 1, 3, { groupId: 'old-q' }),
    ]);
    const byGroup = new Map(
      clusters.map((cluster) => [cluster.groupId, [...cluster.faceIds].sort()]),
    );
    expect(byGroup.get('old-p')).toStrictEqual(['p0', 'p1', 'p2']);
    expect(byGroup.get('old-q')).toStrictEqual(['q0', 'q1', 'q2']);
  });

  it('gives a split group to one part and a new group to the other', () => {
    const clusters = recluster([
      ...facesOf('p', 0, 3, { groupId: 'one' }),
      ...facesOf('q', 1, 2, { groupId: 'one' }),
    ]);
    expect(clusters.map((cluster) => cluster.groupId).sort()).toStrictEqual([null, 'one']);
    expect(clusters.find((cluster) => cluster.groupId === 'one')?.faceIds).toHaveLength(3);
  });

  it('pulls faces into a confirmed group and never merges two confirmed groups', () => {
    const clusters = recluster([
      face('c1', axis(0), { groupId: 'g1', confirmed: true }),
      face('c2', axis(0, 0.2, 5), { groupId: 'g2', confirmed: true }),
      face('free', axis(0, 0.1, 3)),
    ]);
    const owner = clusters.find((cluster) => cluster.faceIds.includes('free'));
    expect(owner?.groupId === 'g1' || owner?.groupId === 'g2').toBe(true);
    const g1 = clusters.find((cluster) => cluster.groupId === 'g1');
    const g2 = clusters.find((cluster) => cluster.groupId === 'g2');
    expect(g1?.faceIds).toContain('c1');
    expect(g1?.faceIds).not.toContain('c2');
    expect(g2?.faceIds).toContain('c2');
  });

  it('keeps a confirmed face in its group even when nothing resembles it', () => {
    const clusters = recluster([
      face('c', axis(4), { groupId: 'g', confirmed: true }),
      ...facesOf('p', 0, 2),
    ]);
    expect(clusters.find((cluster) => cluster.groupId === 'g')?.faceIds).toStrictEqual(['c']);
  });

  it('never puts a face into a group it was rejected from', () => {
    const clusters = recluster([
      face('c', axis(0), { groupId: 'g', confirmed: true }),
      face('stranger', axis(0, 0.1, 1), { rejectedGroupIds: new Set(['g']) }),
      face('other', axis(0, 0.1, 2), { rejectedGroupIds: new Set(['g']) }),
    ]);
    expect(clusters.find((cluster) => cluster.groupId === 'g')?.faceIds).toStrictEqual(['c']);
    expect(idsOf(clusters).some((ids) => ids.includes('stranger') && ids.includes('other'))).toBe(
      true,
    );
  });

  it('does not hand a rejected old group back to the cluster it was rejected from', () => {
    const clusters = recluster([
      face('x', axis(0), { groupId: 'old', rejectedGroupIds: new Set(['old']) }),
      face('y', axis(0, 0.1, 4), { groupId: 'old', rejectedGroupIds: new Set(['old']) }),
    ]);
    expect(clusters.every((cluster) => cluster.groupId === null)).toBe(true);
  });

  it('is deterministic for a seed and covers every face exactly once', () => {
    const faces = [...facesOf('p', 0, 5), ...facesOf('q', 1, 5), ...facesOf('r', 2, 2)];
    const first = recluster(faces, { seed: 7 });
    expect(recluster(faces, { seed: 7 })).toStrictEqual(first);
    expect(first.flatMap((cluster) => cluster.faceIds).sort()).toStrictEqual(
      faces.map((item) => item.id).sort(),
    );
  });

  it('handles no faces and a custom threshold', () => {
    expect(recluster([])).toStrictEqual([]);
    expect(recluster(facesOf('p', 0, 3), { threshold: 0.9999 })).toHaveLength(3);
  });

  it('assigns every face to exactly one cluster for any input', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 4 }), { maxLength: 25 }),
        fc.integer({ min: 1, max: 99 }),
        (axes, seed) => {
          const faces = axes.map((index, at) => face(`f${String(at)}`, axis(index, 0.2, at)));
          const clusters = recluster(faces, { seed });
          expect(clusters.flatMap((cluster) => cluster.faceIds).sort()).toStrictEqual(
            faces.map((item) => item.id).sort(),
          );
        },
      ),
    );
  });
});
