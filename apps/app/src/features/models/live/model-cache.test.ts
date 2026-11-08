import { describe, expect, it } from 'vitest';
import { fanSpec } from '../visual/visual-fixture';
import { createModelCache, liveModelHash } from './model-cache';

const KEY = { specHash: 'fan', lod: 0, finish: null, params: {} } as const;

describe('live model cache', () => {
  it('shares one build per model hash and disposes it when no view holds it', () => {
    const cache = createModelCache();
    const spec = fanSpec();
    const first = cache.acquire(KEY, spec);
    const second = cache.acquire(KEY, spec);
    expect(first.built).toBe(second.built);
    expect(cache.hashes()).toEqual([liveModelHash(KEY)]);
    const item = first.createItem();
    expect(cache.gpuBytes(first.hash)).toBeGreaterThan(0);
    first.release();
    first.release();
    expect(cache.hashes()).toHaveLength(1);
    item.dispose();
    second.release();
    expect(cache.hashes()).toEqual([]);
    expect(cache.gpuBytes(first.hash)).toBe(0);
  });

  it('keys by spec hash, lod, finish and params in a stable order', () => {
    const a = liveModelHash({ ...KEY, params: { b: 1, a: 2 } });
    const b = liveModelHash({ ...KEY, params: { a: 2, b: 1 } });
    expect(a).toBe(b);
    expect(liveModelHash({ ...KEY, lod: 1 })).not.toBe(liveModelHash(KEY));
  });

  it('shares geometry between items of the same hash', () => {
    const cache = createModelCache();
    const hold = cache.acquire(KEY, fanSpec());
    const one = hold.createItem();
    const two = hold.createItem();
    const meshes = (root: typeof one.object3d): string[] =>
      root.children.filter((node) => 'geometry' in node).map((node) => node.name);
    expect(meshes(one.object3d)).toEqual(meshes(two.object3d));
    cache.dispose();
    expect(cache.hashes()).toEqual([]);
  });
});
