import { createHash } from 'node:crypto';
import { MODEL_SPEC } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';

const SPEC_TEXT = JSON.stringify({
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
});

const mocks = vi.hoisted(() => ({
  callBytes: vi.fn<(endpoint: unknown, input: unknown) => Promise<Uint8Array>>(),
  disk: new Map<string, Uint8Array>(),
}));

vi.mock('../../../api/transport', () => ({
  api: (): { callBytes: typeof mocks.callBytes } => ({ callBytes: mocks.callBytes }),
}));

vi.mock('./asset-cache', () => ({
  assetCache: {
    read: (hash: string): Promise<Uint8Array | null> =>
      Promise.resolve(mocks.disk.get(hash) ?? null),
    write: (hash: string, bytes: Uint8Array): Promise<void> => {
      mocks.disk.set(hash, bytes);
      return Promise.resolve();
    },
    prune: (): Promise<number> => Promise.resolve(0),
  },
}));

vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digest: (_algorithm: string, bytes: Uint8Array): Promise<ArrayBuffer> =>
    Promise.resolve(Uint8Array.from(createHash('sha256').update(bytes).digest()).buffer),
}));

const { modelAssets, useModelAssetBytes, useModelSpec } = await import('./use-model-asset');

describe('the model asset hooks and their loader', () => {
  it('exposes the two hooks the model views are built on', () => {
    expect(typeof useModelSpec).toBe('function');
    expect(typeof useModelAssetBytes).toBe('function');
  });

  it('reads a spec by hash from the hub, checks it with the real digest and caches it', async () => {
    const bytes = new TextEncoder().encode(SPEC_TEXT);
    const hash = createHash('sha256').update(bytes).digest('hex');
    mocks.callBytes.mockResolvedValue(bytes);
    const state = await new Promise<unknown>((resolve) => {
      const release = modelAssets.specs.hold(hash, (next) => {
        if (next.status === 'loading') return;
        queueMicrotask(release);
        resolve(next);
      });
    });
    expect(state).toMatchObject({ status: 'ready' });
    expect(MODEL_SPEC.safeParse(Reflect.get(Object(state), 'value')).success).toBe(true);
    expect(mocks.disk.get(hash)).toStrictEqual(bytes);
    expect(mocks.callBytes).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/api/model-assets/:sha256' }),
      { params: { sha256: hash } },
    );
  });

  it('refuses bytes the hub sent under another hash', async () => {
    const hash = 'b'.repeat(64);
    mocks.callBytes.mockResolvedValue(new TextEncoder().encode(SPEC_TEXT));
    const state = await new Promise<unknown>((resolve) => {
      const release = modelAssets.files.hold(hash, (next) => {
        if (next.status === 'loading') return;
        queueMicrotask(release);
        resolve(next);
      });
    });
    expect(state).toMatchObject({ status: 'failed' });
    expect(mocks.disk.has(hash)).toBe(false);
  });
});
