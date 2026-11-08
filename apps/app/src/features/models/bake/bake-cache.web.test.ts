import { describe, expect, it, vi } from 'vitest';
import { BAKE_VERSION } from '../../../components/models/three/bake-version';
import type { BakeKey, BakedImage } from './bake-protocol';

const rows = vi.hoisted(() => new Map<string, unknown>());

vi.mock('idb-keyval', () => ({
  createStore: (): string => 'store',
  get: (key: string): Promise<unknown> => Promise.resolve(rows.get(key)),
  set: (key: string, value: unknown): Promise<void> => {
    rows.set(key, value);
    return Promise.resolve();
  },
  entries: (): Promise<[string, unknown][]> => Promise.resolve([...rows.entries()]),
  delMany: (keys: readonly string[]): Promise<void> => {
    for (const key of keys) rows.delete(key);
    return Promise.resolve();
  },
}));

const { bakeCache } = await import('./bake-cache.web');

function keyOf(specHash: string): BakeKey {
  return {
    specHash,
    bakeVersion: BAKE_VERSION,
    tokenHash: 'tokens',
    finish: null,
    params: {},
    view: 'card',
    width: 50,
    height: 40,
    dpr: 2,
    theme: 'dark',
    target: { kind: 'shot', shotId: 'spin' },
  };
}

const CLIP: BakedImage = {
  kind: 'clip',
  id: 'r1',
  width: 50,
  height: 40,
  dpr: 2,
  ms: 9,
  shotId: 'spin',
  uri: 'data:image/png;base64,AA==',
  rect: { x: 1, y: 2, width: 30, height: 20 },
  columns: 3,
  rows: 3,
  introFrames: 0,
  loopFrames: 8,
  stillFrame: 2,
  frameS: 0.025,
  periodS: 0.2,
};

describe('bake cache in the browser', () => {
  it('stores the bake with its data URL under the key hash', async () => {
    rows.clear();
    const stored = await bakeCache.write(keyOf('a'), CLIP);
    expect(stored.image).toEqual(CLIP);
    await expect(bakeCache.read(keyOf('a'))).resolves.toEqual(stored);
    await expect(bakeCache.read(keyOf('b'))).resolves.toBeNull();
  });

  it('deletes superseded and unreadable rows on prune', async () => {
    rows.clear();
    await bakeCache.write(keyOf('a'), CLIP);
    await bakeCache.write(keyOf('old'), CLIP);
    rows.set('broken', '{');
    const inUse = {
      specHashes: new Set(['a']),
      tokenHashes: new Set(['tokens']),
      themes: new Set(['dark'] as const),
    };
    await expect(bakeCache.prune(inUse)).resolves.toBe(2);
    expect(rows.size).toBe(1);
  });
});
