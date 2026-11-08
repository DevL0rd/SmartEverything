import type { ModelSpec } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import { BAKE_VERSION } from '../../../components/models/three/bake-version';
import {
  bakeKeyHash,
  bakeKeyText,
  type BakeCache,
  type BakeKey,
  type BakeRequest,
  type BakeResult,
  type BakedImage,
  type BakesInUse,
  type StoredBake,
} from './bake-protocol';
import { bitmapBytes, createBakeQueue, type BakeOutcome } from './bake-queue';

const SPEC: ModelSpec = {
  schema: 1,
  id: 'dev.test.box',
  version: '1.0.0',
  title: 'Box',
  category: 'other',
  footprint: { width: 1, depth: 1, height: 1 },
  framing: {
    tile: { yaw: 0, pitch: 0, fov: 30, padding: 0.1 },
    card: { yaw: 0, pitch: 0, fov: 30, padding: 0.1 },
    hero: { yaw: 0, pitch: 0, fov: 30, padding: 0.1 },
  },
  materials: { body: { finish: 'matte-white' } },
  parts: [],
};

function keyOf(specHash: string): BakeKey {
  return {
    specHash,
    bakeVersion: BAKE_VERSION,
    tokenHash: 'tokens',
    finish: null,
    params: {},
    view: 'tile',
    width: 50,
    height: 40,
    dpr: 2,
    theme: 'light',
    target: { kind: 'keyframe', state: 'off' },
  };
}

function image(id: string): BakedImage {
  const rect = { x: 0, y: 0, width: 10, height: 5 };
  const layer = {
    id: 'body',
    role: 'body' as const,
    uri: 'data:image/png;base64,AA',
    rect,
    pivot: null,
    channels: [],
  };
  return {
    kind: 'layers',
    id,
    width: 50,
    height: 40,
    dpr: 2,
    ms: 4,
    layers: [layer, layer],
    anchors: [],
  };
}

function memoryCache(): BakeCache & { readonly stored: Map<string, StoredBake> } {
  const stored = new Map<string, StoredBake>();
  return {
    stored,
    read: (key): Promise<StoredBake | null> =>
      Promise.resolve(stored.get(bakeKeyHash(key)) ?? null),
    write: (key, made): Promise<StoredBake> => {
      const entry = { keyText: bakeKeyText(key), key, image: made };
      stored.set(bakeKeyHash(key), entry);
      return Promise.resolve(entry);
    },
    prune: (): Promise<number> => Promise.resolve(3),
  };
}

interface Baker {
  readonly order: string[];
  readonly bake: (request: BakeRequest) => Promise<BakeResult>;
  readonly finish: () => void;
}

function controlledBaker(): Baker {
  const order: string[] = [];
  const waiting: (() => void)[] = [];
  return {
    order,
    bake: (request): Promise<BakeResult> => {
      order.push(request.key.specHash);
      return new Promise((resolve) => {
        waiting.push(() => {
          resolve(image(request.id));
        });
      });
    },
    finish: (): void => {
      waiting.shift()?.();
    },
  };
}

async function settle(): Promise<void> {
  for (let at = 0; at < 10; at += 1) await Promise.resolve();
}

describe('bake queue', () => {
  it('measures decoded bitmap bytes as width times height times four at the dpr', () => {
    expect(bitmapBytes(image('x'))).toBe(2 * 20 * 10 * 4);
  });

  it('bakes on-screen requests before the rest of the page', async () => {
    const baker = controlledBaker();
    const queue = createBakeQueue({ cache: memoryCache(), bake: baker.bake });
    queue.want({ key: keyOf('a'), spec: SPEC, screen: 's', priority: 'page' }, vi.fn());
    queue.want({ key: keyOf('b'), spec: SPEC, screen: 's', priority: 'page' }, vi.fn());
    queue.want({ key: keyOf('c'), spec: SPEC, screen: 's', priority: 'screen' }, vi.fn());
    await settle();
    expect(baker.order).toEqual(['a']);
    baker.finish();
    await settle();
    expect(baker.order).toEqual(['a', 'c']);
    baker.finish();
    await settle();
    expect(baker.order).toEqual(['a', 'c', 'b']);
  });

  it('serves a cached bake without baking and shares one bake between holders', async () => {
    const cache = memoryCache();
    const baker = controlledBaker();
    await cache.write(keyOf('hit'), image('old'));
    const queue = createBakeQueue({ cache, bake: baker.bake });
    const hit = vi.fn<(outcome: BakeOutcome) => void>();
    queue.want({ key: keyOf('hit'), spec: SPEC, screen: 's', priority: 'screen' }, hit);
    const one = vi.fn<(outcome: BakeOutcome) => void>();
    const two = vi.fn<(outcome: BakeOutcome) => void>();
    queue.want({ key: keyOf('miss'), spec: SPEC, screen: 's', priority: 'screen' }, one);
    queue.want({ key: keyOf('miss'), spec: SPEC, screen: 't', priority: 'page' }, two);
    await settle();
    baker.finish();
    await settle();
    expect(hit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'baked' }));
    expect(baker.order).toEqual(['miss']);
    expect(one).toHaveBeenCalledTimes(1);
    expect(two).toHaveBeenCalledTimes(1);
    expect(cache.stored.has(bakeKeyHash(keyOf('miss')))).toBe(true);
  });

  it('drops a released request that has not started, so closed screens bake nothing', async () => {
    const baker = controlledBaker();
    const queue = createBakeQueue({ cache: memoryCache(), bake: baker.bake });
    queue.want({ key: keyOf('a'), spec: SPEC, screen: 's', priority: 'screen' }, vi.fn());
    const gone = queue.want(
      { key: keyOf('b'), spec: SPEC, screen: 'closed', priority: 'page' },
      vi.fn(),
    );
    await settle();
    gone.release();
    baker.finish();
    await settle();
    expect(baker.order).toEqual(['a']);
  });

  it('reports a failed bake to its holders', async () => {
    const failing = (request: BakeRequest): Promise<BakeResult> =>
      Promise.resolve({ kind: 'failed', id: request.id, reason: 'webgl', detail: 'none' });
    const queue = createBakeQueue({ cache: memoryCache(), bake: failing });
    const listener = vi.fn<(outcome: BakeOutcome) => void>();
    queue.want({ key: keyOf('a'), spec: SPEC, screen: 's', priority: 'screen' }, listener);
    await settle();
    expect(listener).toHaveBeenCalledWith({ kind: 'failed', reason: 'webgl', detail: 'none' });
  });

  it('lands a failed outcome and keeps baking when the bake or the cache write throws', async () => {
    const cache = memoryCache();
    const throwing: BakeCache = {
      ...cache,
      write: (): Promise<StoredBake> => Promise.reject(new Error('disk full')),
    };
    const baker = controlledBaker();
    const queue = createBakeQueue({ cache: throwing, bake: baker.bake });
    const first = vi.fn<(outcome: BakeOutcome) => void>();
    const second = vi.fn<(outcome: BakeOutcome) => void>();
    queue.want({ key: keyOf('a'), spec: SPEC, screen: 's', priority: 'screen' }, first);
    queue.want({ key: keyOf('b'), spec: SPEC, screen: 's', priority: 'screen' }, second);
    await settle();
    baker.finish();
    await settle();
    const failure = { kind: 'failed', reason: 'render', detail: 'Error: disk full' };
    expect(first).toHaveBeenCalledWith(failure);
    expect(baker.order).toEqual(['a', 'b']);
    const late = vi.fn<(outcome: BakeOutcome) => void>();
    queue.want({ key: keyOf('a'), spec: SPEC, screen: 't', priority: 'page' }, late);
    expect(late).toHaveBeenCalledWith(failure);

    const rejecting = createBakeQueue({
      cache: memoryCache(),
      bake: (): Promise<BakeResult> => Promise.reject(new Error('lost context')),
    });
    const holder = vi.fn<(outcome: BakeOutcome) => void>();
    rejecting.want({ key: keyOf('c'), spec: SPEC, screen: 's', priority: 'screen' }, holder);
    await settle();
    expect(holder).toHaveBeenCalledWith({
      kind: 'failed',
      reason: 'render',
      detail: 'Error: lost context',
    });
  });

  it('prunes once at start with the bakes in use, after the home has loaded', async () => {
    const prune = vi.fn<(inUse: BakesInUse) => Promise<number>>(() => Promise.resolve(3));
    const queue = createBakeQueue({
      cache: { ...memoryCache(), prune },
      bake: controlledBaker().bake,
    });
    const inUse: BakesInUse = {
      specHashes: new Set(['spec1']),
      tokenHashes: new Set(['tokens']),
      themes: new Set(['light', 'dark']),
    };
    const known = vi.fn<() => BakesInUse | null>(() => null);
    queue.pruneOnce(known);
    await settle();
    expect(prune).not.toHaveBeenCalled();
    known.mockReturnValue(inUse);
    queue.pruneOnce(known);
    queue.pruneOnce(known);
    await settle();
    expect(prune).toHaveBeenCalledTimes(1);
    expect(prune).toHaveBeenCalledWith(inUse);
  });
});
