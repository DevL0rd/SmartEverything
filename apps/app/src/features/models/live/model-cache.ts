import type { ModelSpec } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { Mesh, Texture, type BufferGeometry, type Material, type Object3D } from 'three';
import { buildModel, type BuiltModel } from '../../../components/models/three/build-model';
import type { ModelLod } from '../../../components/models/three/geometry';
import { createSceneModelSet, type SceneModel } from '../../../components/models/three/scene-model';

const log = new Logger('app.models');

export interface LiveModelKey {
  readonly specHash: string;
  readonly lod: ModelLod;
  readonly finish: string | null;
  readonly params: Readonly<Record<string, number>>;
}

export function liveModelHash(key: LiveModelKey): string {
  const params = Object.entries(key.params).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify([key.specHash, key.lod, key.finish, params]);
}

export interface ModelHold {
  readonly hash: string;
  readonly spec: ModelSpec;
  readonly built: BuiltModel;
  readonly createItem: () => SceneModel;
  readonly release: () => void;
}

export interface ModelCache {
  readonly acquire: (key: LiveModelKey, spec: ModelSpec) => ModelHold;
  readonly hashes: () => readonly string[];
  readonly gpuBytes: (hash: string) => number;
  readonly dispose: () => void;
}

interface Entry {
  readonly hash: string;
  readonly spec: ModelSpec;
  readonly built: BuiltModel;
  readonly items: Set<SceneModel>;
  readonly holders: Set<object>;
}

function isMesh(node: Object3D): node is Mesh {
  return node instanceof Mesh;
}

function materialsOf(mesh: Mesh): readonly Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function materialTextures(material: Material): Texture[] {
  return Object.values(material).filter((value): value is Texture => value instanceof Texture);
}

function textureBytes(texture: Texture): number {
  const data: unknown = texture.image;
  if (typeof data !== 'object' || data === null || !('data' in data)) return 0;
  const { data: pixels } = data;
  return ArrayBuffer.isView(pixels) ? pixels.byteLength : 0;
}

function geometryBytes(geometry: BufferGeometry): number {
  const attributes = Object.values(geometry.attributes);
  const index = geometry.index === null ? 0 : geometry.index.array.byteLength;
  return attributes.reduce((sum, attribute) => sum + attribute.array.byteLength, index);
}

export function measureGpuBytes(roots: readonly Object3D[]): number {
  const geometries = new Set<BufferGeometry>();
  const textures = new Set<Texture>();
  for (const root of roots) {
    root.traverse((node) => {
      if (!isMesh(node)) return;
      geometries.add(node.geometry);
      for (const texture of materialsOf(node).flatMap(materialTextures)) textures.add(texture);
    });
  }
  let bytes = 0;
  for (const geometry of geometries) bytes += geometryBytes(geometry);
  for (const texture of textures) bytes += textureBytes(texture);
  return bytes;
}

function entryBytes(entry: Entry): number {
  return measureGpuBytes([entry.built.group, ...[...entry.items].map((item) => item.object3d)]);
}

type ItemSet = ReturnType<typeof createSceneModelSet>;

function optionsOf(key: LiveModelKey): Parameters<ItemSet['createSceneModel']>[1] {
  return { lod: key.lod, finish: key.finish ?? undefined, params: key.params };
}

function itemOf(set: ItemSet, entry: Entry, key: LiveModelKey): SceneModel {
  const item = set.createSceneModel(entry.spec, optionsOf(key));
  const own: SceneModel = {
    ...item,
    dispose: (): void => {
      entry.items.delete(own);
      item.dispose();
    },
  };
  entry.items.add(own);
  return own;
}

function drop(entries: Map<string, Entry>, entry: Entry): void {
  for (const item of [...entry.items]) item.dispose();
  entry.built.dispose();
  entries.delete(entry.hash);
  log.debug('model.live_released', { hash: entry.hash });
}

function holdOf(
  set: ItemSet,
  entries: Map<string, Entry>,
  entry: Entry,
  key: LiveModelKey,
): ModelHold {
  const holder = {};
  entry.holders.add(holder);
  return {
    hash: entry.hash,
    spec: entry.spec,
    built: entry.built,
    createItem: (): SceneModel => itemOf(set, entry, key),
    release: (): void => {
      if (!entry.holders.delete(holder)) return;
      if (entry.holders.size === 0) drop(entries, entry);
    },
  };
}

function openEntry(key: LiveModelKey, spec: ModelSpec, hash: string): Entry {
  const built = buildModel(spec, optionsOf(key));
  return { hash, spec, built, items: new Set(), holders: new Set() };
}

export function createModelCache(): ModelCache {
  const set = createSceneModelSet({ instancing: false });
  const entries = new Map<string, Entry>();
  return {
    acquire: (key, spec): ModelHold => {
      const hash = liveModelHash(key);
      const known = entries.get(hash);
      const entry = known ?? openEntry(key, spec, hash);
      entries.set(hash, entry);
      if (known === undefined) {
        log.debug('model.live_gpu_bytes', () => ({ hash, bytes: entryBytes(entry) }));
      }
      return holdOf(set, entries, entry, key);
    },
    hashes: (): readonly string[] => [...entries.keys()],
    gpuBytes: (hash): number => {
      const entry = entries.get(hash);
      return entry === undefined ? 0 : entryBytes(entry);
    },
    dispose: (): void => {
      for (const entry of [...entries.values()]) drop(entries, entry);
      set.dispose();
    },
  };
}
