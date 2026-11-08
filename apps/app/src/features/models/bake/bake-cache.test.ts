import { describe, expect, it, vi } from 'vitest';
import { BAKE_VERSION } from '../../../components/models/three/bake-version';
import type { BakeKey, BakedImage } from './bake-protocol';

const disk = vi.hoisted(() => new Map<string, string>());

vi.mock('expo-file-system', () => {
  const join = (parts: readonly (string | { readonly uri: string })[]): string =>
    parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
  class File {
    readonly uri: string;
    constructor(...parts: (string | { readonly uri: string })[]) {
      this.uri = join(parts);
    }
    get name(): string {
      return this.uri.split('/').pop() ?? '';
    }
    get exists(): boolean {
      return disk.has(this.uri);
    }
    write(content: string): void {
      disk.set(this.uri, content);
    }
    text(): Promise<string> {
      return Promise.resolve(disk.get(this.uri) ?? '');
    }
    delete(): void {
      disk.delete(this.uri);
    }
  }
  class Directory {
    readonly uri: string;
    constructor(...parts: (string | { readonly uri: string })[]) {
      this.uri = join(parts);
    }
    readonly exists = true;
    create(): boolean {
      return this.exists;
    }
    list(): File[] {
      return [...disk.keys()]
        .filter((uri) => uri.startsWith(`${this.uri}/`))
        .map((uri) => new File(uri));
    }
  }
  return { File, Directory, Paths: { cache: new Directory('file:///cache') } };
});

const { bakeCache } = await import('./bake-cache');

function keyOf(specHash: string, theme: BakeKey['theme'] = 'light'): BakeKey {
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
    theme,
    target: { kind: 'keyframe', state: 'off' },
  };
}

const IMAGE: BakedImage = {
  kind: 'layers',
  id: 'r1',
  width: 50,
  height: 40,
  dpr: 2,
  ms: 4,
  anchors: [],
  layers: [
    {
      id: 'body',
      role: 'body',
      uri: 'data:image/png;base64,iVBORw0KGgo=',
      rect: { x: 0, y: 0, width: 10, height: 5 },
      pivot: null,
      channels: [],
    },
  ],
};

const IN_USE = {
  specHashes: new Set(['a']),
  tokenHashes: new Set(['tokens']),
  themes: new Set(['light', 'dark'] as const),
};

describe('bake cache on the device', () => {
  it('writes each layer as a PNG file and reads the bake back by its full key', async () => {
    disk.clear();
    const stored = await bakeCache.write(keyOf('a'), IMAGE);
    const uri = stored.image.kind === 'layers' ? stored.image.layers[0]?.uri : undefined;
    expect(uri).toMatch(/^file:\/\/\/cache\/model-bakes\/[0-9a-f]+\.0\.png$/u);
    expect(disk.get(uri ?? '')).toBe('iVBORw0KGgo=');
    await expect(bakeCache.read(keyOf('a'))).resolves.toEqual(stored);
    await expect(bakeCache.read(keyOf('a', 'dark'))).resolves.toBeNull();
  });

  it('treats a bake whose image file the system cleared as missing', async () => {
    disk.clear();
    const stored = await bakeCache.write(keyOf('a'), IMAGE);
    const uri = stored.image.kind === 'layers' ? stored.image.layers[0]?.uri : undefined;
    disk.delete(uri ?? '');
    await expect(bakeCache.read(keyOf('a'))).resolves.toBeNull();
  });

  it('deletes superseded entries and their images on prune, keeping the rest', async () => {
    disk.clear();
    await bakeCache.write(keyOf('a'), IMAGE);
    await bakeCache.write(keyOf('a', 'dark'), IMAGE);
    await bakeCache.write(keyOf('old'), IMAGE);
    await expect(bakeCache.prune(IN_USE)).resolves.toBe(1);
    expect(disk.size).toBe(4);
    await expect(bakeCache.read(keyOf('a', 'dark'))).resolves.not.toBeNull();
    await expect(bakeCache.read(keyOf('old'))).resolves.toBeNull();
  });
});
