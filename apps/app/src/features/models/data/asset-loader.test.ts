import { MODEL_SPEC, type ModelSpec } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import type { AssetCache } from './asset-cache-protocol';
import { AssetHashMismatchError, ModelAssets, type ModelAssetState } from './asset-loader';

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
  parts: [
    {
      id: 'base',
      geometry: { type: 'cylinder', height: 0.03, topRadius: 0.02, bottomRadius: 0.015 },
      material: 'body',
    },
  ],
};

const SPEC_BYTES = new TextEncoder().encode(JSON.stringify(SPEC));

const HASH = 'a'.repeat(64);

function memoryCache(initial: Readonly<Record<string, Uint8Array>> = {}): AssetCache & {
  readonly disk: Map<string, Uint8Array>;
} {
  const disk = new Map(Object.entries(initial));
  return {
    disk,
    read: (hash): Promise<Uint8Array | null> => Promise.resolve(disk.get(hash) ?? null),
    write: (hash, bytes): Promise<void> => {
      disk.set(hash, bytes);
      return Promise.resolve();
    },
    prune: (keep): Promise<number> => {
      const stale = [...disk.keys()].filter((hash) => !keep.has(hash));
      for (const hash of stale) disk.delete(hash);
      return Promise.resolve(stale.length);
    },
  };
}

function loaderOf(
  options: {
    readonly cache?: AssetCache;
    readonly body?: Uint8Array;
    readonly digest?: string;
  } = {},
): {
  readonly assets: ModelAssets;
  readonly fetchBytes: ReturnType<typeof vi.fn<(hash: string) => Promise<Uint8Array>>>;
  readonly cache: AssetCache & { readonly disk: Map<string, Uint8Array> };
} {
  const cache = memoryCache();
  const fetchBytes = vi.fn<(hash: string) => Promise<Uint8Array>>(() =>
    Promise.resolve(options.body ?? SPEC_BYTES),
  );
  const assets = new ModelAssets({
    cache: options.cache ?? cache,
    fetchBytes,
    digest: (): Promise<string> => Promise.resolve(options.digest ?? HASH),
  });
  return { assets, fetchBytes, cache };
}

function settled<T>(
  held: {
    hold: (hash: string, listener: (state: ModelAssetState<T>) => void) => () => void;
  },
  hash: string,
): Promise<{ readonly state: ModelAssetState<T>; readonly release: () => void }> {
  return new Promise((resolve) => {
    const release = held.hold(hash, (state) => {
      if (state.status === 'ready' || state.status === 'failed') {
        queueMicrotask(() => {
          resolve({ state, release });
        });
      }
    });
  });
}

describe('the model asset loader', () => {
  it('fetches an unknown file once, checks its hash and keeps it for the next start', async () => {
    const { assets, fetchBytes, cache } = loaderOf();
    expect(await assets.bytes(HASH)).toBe(SPEC_BYTES);
    expect(cache.disk.get(HASH)).toBe(SPEC_BYTES);
    expect(await assets.bytes(HASH)).toBe(SPEC_BYTES);
    expect(fetchBytes).toHaveBeenCalledTimes(1);
  });

  it('serves a cached file without asking the server', async () => {
    const cache = memoryCache({ [HASH]: SPEC_BYTES });
    const { assets, fetchBytes } = loaderOf({ cache });
    expect(await assets.bytes(HASH)).toBe(SPEC_BYTES);
    expect(fetchBytes).not.toHaveBeenCalled();
  });

  it('shares one fetch between simultaneous requests for the same hash', async () => {
    const { assets, fetchBytes } = loaderOf();
    const [first, second] = await Promise.all([assets.bytes(HASH), assets.bytes(HASH)]);
    expect(first).toBe(second);
    expect(fetchBytes).toHaveBeenCalledTimes(1);
  });

  it('refuses bytes whose hash is not the one asked for and caches nothing', async () => {
    const { assets, cache } = loaderOf({ digest: 'b'.repeat(64) });
    await expect(assets.bytes(HASH)).rejects.toBeInstanceOf(AssetHashMismatchError);
    expect(cache.disk.size).toBe(0);
  });

  it('still returns the bytes when the cache cannot be written', async () => {
    const failing: AssetCache = {
      read: () => Promise.resolve(null),
      write: () => Promise.reject(new Error('disk full')),
      prune: () => Promise.resolve(0),
    };
    const { assets } = loaderOf({ cache: failing });
    expect(await assets.bytes(HASH)).toBe(SPEC_BYTES);
  });

  it('parses a spec file into a model spec', async () => {
    const { assets } = loaderOf();
    const { state, release } = await settled(assets.specs, HASH);
    release();
    expect(state.status).toBe('ready');
    expect(state.status === 'ready' && MODEL_SPEC.safeParse(state.value).success).toBe(true);
    expect(state.status === 'ready' && state.value.id).toBe('dev.test.box');
  });

  it('reports a file that is not a spec as failed with the reason', async () => {
    const { assets } = loaderOf({ body: new TextEncoder().encode('{"schema":1}') });
    const { state, release } = await settled(assets.specs, HASH);
    release();
    expect(state.status === 'failed' && state.detail).toContain('is not a model spec');
  });

  it('reports text that is not JSON as failed', async () => {
    const { assets } = loaderOf({ body: new TextEncoder().encode('not json') });
    const { state, release } = await settled(assets.specs, HASH);
    release();
    expect(state.status).toBe('failed');
  });

  it('hands raw bytes to a holder of the file view', async () => {
    const glb = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);
    const { assets } = loaderOf({ body: glb });
    const { state, release } = await settled(assets.files, HASH);
    release();
    expect(state).toStrictEqual({ status: 'ready', value: glb });
  });

  it('drops the memory entry when the last holder leaves and loads again for the next', async () => {
    const { assets, fetchBytes } = loaderOf();
    const first = await settled(assets.specs, HASH);
    expect(assets.specs.hashes()).toStrictEqual([HASH]);
    first.release();
    expect(assets.specs.hashes()).toStrictEqual([]);
    const second = await settled(assets.specs, HASH);
    second.release();
    expect(second.state.status).toBe('ready');
    expect(fetchBytes).toHaveBeenCalledTimes(1);
  });

  it('keeps one entry while two holders share it', async () => {
    const { assets } = loaderOf();
    const first = await settled(assets.specs, HASH);
    const release = assets.specs.hold(HASH, () => undefined);
    first.release();
    expect(assets.specs.hashes()).toStrictEqual([HASH]);
    release();
    expect(assets.specs.hashes()).toStrictEqual([]);
  });

  describe('clearing superseded files', () => {
    it('waits until the home has loaded, then runs once and keeps every hash the hub lists or the app holds', async () => {
      const kept = 'c'.repeat(64);
      const stale = 'd'.repeat(64);
      const cache = memoryCache({ [kept]: SPEC_BYTES, [stale]: SPEC_BYTES, [HASH]: SPEC_BYTES });
      const { assets } = loaderOf({ cache });
      const first = await settled(assets.specs, HASH);
      assets.pruneOnce(() => null);
      expect(cache.disk.size).toBe(3);
      assets.pruneOnce(() => new Set([kept]));
      await vi.waitFor(() => {
        expect([...cache.disk.keys()].sort()).toStrictEqual([HASH, kept].sort());
      });
      cache.disk.set(stale, SPEC_BYTES);
      assets.pruneOnce(() => new Set());
      await Promise.resolve();
      expect(cache.disk.has(stale)).toBe(true);
      first.release();
    });
  });
});
