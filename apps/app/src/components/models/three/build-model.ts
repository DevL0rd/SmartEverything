import {
  blurLayerIds,
  modelParamValues,
  shownParts,
  type ModelSpec,
  type ModelSpecPart,
  type ModelSpecTransform,
} from '@smarteverything/domain/model-spec';
import {
  Group,
  Mesh,
  type BufferGeometry,
  type DataTexture,
  type MeshPhysicalMaterial,
  type Object3D,
} from 'three';
import { BAKE_VERSION } from './bake-version';
import {
  buildGeometry,
  resolveValue,
  triangleCount,
  type ModelLod,
  type ModelParamValues,
} from './geometry';
import {
  linearColor,
  partSurface,
  physicalMaterial,
  resolveMaterial,
  type DrawLayer,
  type MaterialMaps,
  type ModelMaterialParams,
} from './materials';
import { patternPixels, patternSize, patternTexture, type PatternPixels } from './patterns';

interface PatternEntry {
  readonly pixels: PatternPixels;
  readonly texture: DataTexture;
}

export interface ModelResources {
  readonly geometries: Map<string, BufferGeometry>;
  readonly materials: Map<string, MeshPhysicalMaterial>;
  readonly patterns: Map<string, PatternEntry>;
  readonly dispose: () => void;
}

export interface BuildModelOptions {
  readonly lod: ModelLod;
  readonly finish?: string | undefined;
  readonly params?: ModelParamValues | undefined;
  readonly resources?: ModelResources | undefined;
}

export interface BuiltPart {
  readonly id: string;
  readonly parent: string | null;
  readonly mesh: Mesh<BufferGeometry, MeshPhysicalMaterial>;
  readonly material: ModelMaterialParams;
  readonly doubleSided: boolean;
  readonly draw: DrawLayer;
  readonly pattern: PatternPixels | null;
  readonly layer: string | null;
  readonly contact: boolean;
}

export interface BuiltModel {
  readonly id: string;
  readonly lod: ModelLod;
  readonly finish: string | undefined;
  readonly params: ModelParamValues;
  readonly group: Group;
  readonly parts: readonly BuiltPart[];
  readonly triangles: number;
  readonly dispose: () => void;
}

const DEG = Math.PI / 180;

const FLAT_GEOMETRY = new Set(['roundedPlane', 'glow', 'ring', 'grille']);

const FADED_GEOMETRY = new Set(['glow']);

export function createModelResources(): ModelResources {
  const geometries = new Map<string, BufferGeometry>();
  const materials = new Map<string, MeshPhysicalMaterial>();
  const patterns = new Map<string, PatternEntry>();
  return {
    geometries,
    materials,
    patterns,
    dispose: (): void => {
      for (const geometry of geometries.values()) geometry.dispose();
      for (const material of materials.values()) material.dispose();
      for (const entry of patterns.values()) entry.texture.dispose();
      geometries.clear();
      materials.clear();
      patterns.clear();
    },
  };
}

function cached<K, T>(store: Map<K, T>, key: K, make: () => T): T {
  const hit = store.get(key);
  if (hit !== undefined) return hit;
  const made = make();
  store.set(key, made);
  return made;
}

export function modelParams(spec: ModelSpec, given: ModelParamValues = {}): ModelParamValues {
  return modelParamValues(spec, given);
}

export function lodParts(
  spec: ModelSpec,
  lod: ModelLod,
  params: ModelParamValues = modelParams(spec),
): readonly ModelSpecPart[] {
  return shownParts(spec, lod, params);
}

function applyTransform(
  target: Object3D,
  transform: ModelSpecTransform | undefined,
  params: ModelParamValues,
): void {
  const [px, py, pz] = transform?.position ?? [0, 0, 0];
  target.position.set(resolveValue(px, params), resolveValue(py, params), resolveValue(pz, params));
  const [rx, ry, rz] = transform?.rotation ?? [0, 0, 0];
  target.rotation.set(
    resolveValue(rx, params) * DEG,
    resolveValue(ry, params) * DEG,
    resolveValue(rz, params) * DEG,
  );
  const [sx, sy, sz] = transform?.scale ?? [1, 1, 1];
  target.scale.set(resolveValue(sx, params), resolveValue(sy, params), resolveValue(sz, params));
}

function patternFor(
  params: ModelMaterialParams,
  lod: ModelLod,
  resources: ModelResources,
): PatternEntry | null {
  const size = patternSize(lod);
  if (params.pattern === null || size === 0) return null;
  const pattern = params.pattern;
  return cached(resources.patterns, `${pattern}:${String(size)}`, () => {
    const pixels = patternPixels(pattern, size);
    return { pixels, texture: patternTexture(pixels) };
  });
}

function mapsOf(entry: PatternEntry | null): MaterialMaps {
  if (entry === null) return {};
  return entry.pixels.use === 'tone' ? { tone: entry.texture } : { relief: entry.texture };
}

interface BuildContext {
  readonly spec: ModelSpec;
  readonly lod: ModelLod;
  readonly finish: string | undefined;
  readonly params: ModelParamValues;
  readonly paramsKey: string;
  readonly resources: ModelResources;
  readonly blurLayers: ReadonlySet<string>;
}

function buildPart(part: ModelSpecPart, context: BuildContext): BuiltPart {
  const { lod, params, resources } = context;
  const geometry = cached(
    resources.geometries,
    `${String(lod)}|${context.paramsKey}|${JSON.stringify(part.geometry)}`,
    () => buildGeometry(part.geometry, lod, params),
  );
  const material = resolveMaterial(context.spec, part.material, context.finish);
  const surface = partSurface(material, {
    flat: FLAT_GEOMETRY.has(part.geometry.type),
    faded: FADED_GEOMETRY.has(part.geometry.type),
  });
  const { doubleSided, faded } = surface;
  const pattern = patternFor(material, lod, resources);
  const look = cached(
    resources.materials,
    `${String(lod)}|${String(doubleSided)}|${String(faded)}|${JSON.stringify(material)}`,
    () => physicalMaterial(material, { doubleSided, faded }, mapsOf(pattern)),
  );
  const mesh = new Mesh(geometry, look);
  mesh.name = part.id;
  mesh.renderOrder = surface.renderOrder;
  mesh.visible = !context.blurLayers.has(part.id);
  applyTransform(mesh, part.transform, params);
  return {
    id: part.id,
    parent: part.parent ?? null,
    mesh,
    material,
    doubleSided,
    draw: surface.layer,
    pattern: pattern?.pixels ?? null,
    layer: part.layer ?? null,
    contact: part.contact ?? false,
  };
}

export function buildModel(spec: ModelSpec, options: BuildModelOptions): BuiltModel {
  const owned = options.resources === undefined;
  const resources = options.resources ?? createModelResources();
  const params = modelParams(spec, options.params);
  const finish = options.finish ?? spec.defaultFinish;
  const context: BuildContext = {
    spec,
    lod: options.lod,
    finish,
    params,
    paramsKey: JSON.stringify(params),
    resources,
    blurLayers: blurLayerIds(spec),
  };
  const parts = lodParts(spec, options.lod, params).map((part) => buildPart(part, context));
  const byId = new Map(parts.map((part) => [part.id, part.mesh]));
  const group = new Group();
  group.name = spec.id;
  for (const part of parts) {
    const parent = part.parent === null ? undefined : byId.get(part.parent);
    (parent ?? group).add(part.mesh);
  }
  return {
    id: spec.id,
    lod: options.lod,
    finish,
    params,
    group,
    parts,
    triangles: parts.reduce((sum, part) => sum + triangleCount(part.mesh.geometry), 0),
    dispose: (): void => {
      group.removeFromParent();
      if (owned) resources.dispose();
    },
  };
}

export interface ModelBufferGeometry {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array | null;
  readonly indices: Uint32Array;
}

export interface ModelBufferMaterial extends ModelMaterialParams {
  readonly linear: readonly [number, number, number];
  readonly doubleSided: boolean;
  readonly texture: number | null;
}

export interface ModelBufferPart {
  readonly id: string;
  readonly parent: string | null;
  readonly matrix: Float32Array;
  readonly geometry: number;
  readonly material: number;
  readonly layer: string | null;
  readonly contact: boolean;
  readonly visible: boolean;
}

export interface ModelBuffers {
  readonly id: string;
  readonly bakeVersion: number;
  readonly lod: ModelLod;
  readonly triangles: number;
  readonly geometries: readonly ModelBufferGeometry[];
  readonly materials: readonly ModelBufferMaterial[];
  readonly textures: readonly PatternPixels[];
  readonly parts: readonly ModelBufferPart[];
}

function geometryBuffers(geometry: BufferGeometry): ModelBufferGeometry {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = geometry.hasAttribute('uv') ? geometry.getAttribute('uv') : undefined;
  const index = geometry.getIndex();
  return {
    positions: Float32Array.from(position.array),
    normals: Float32Array.from(normal.array),
    uvs: uv === undefined ? null : Float32Array.from(uv.array),
    indices: index
      ? Uint32Array.from(index.array)
      : Uint32Array.from({ length: position.count }, (_, at) => at),
  };
}

function indexOf<K>(table: Map<K, number>, item: K): number {
  return cached(table, item, () => table.size);
}

export function toModelBuffers(model: BuiltModel): ModelBuffers {
  const geometries = new Map<BufferGeometry, number>();
  const materials = new Map<MeshPhysicalMaterial, ModelBufferMaterial>();
  const textures = new Map<PatternPixels, number>();
  const materialIndex = new Map<MeshPhysicalMaterial, number>();
  const parts = model.parts.map((part): ModelBufferPart => {
    part.mesh.updateMatrix();
    cached(materials, part.mesh.material, () => ({
      ...part.material,
      linear: linearColor(part.material.color),
      doubleSided: part.doubleSided,
      texture: part.pattern === null ? null : indexOf(textures, part.pattern),
    }));
    return {
      id: part.id,
      parent: part.parent,
      matrix: Float32Array.from(part.mesh.matrix.elements),
      geometry: indexOf(geometries, part.mesh.geometry),
      material: indexOf(materialIndex, part.mesh.material),
      layer: part.layer,
      contact: part.contact,
      visible: part.mesh.visible,
    };
  });
  return {
    id: model.id,
    bakeVersion: BAKE_VERSION,
    lod: model.lod,
    triangles: model.triangles,
    geometries: [...geometries.keys()].map(geometryBuffers),
    materials: [...materials.values()],
    textures: [...textures.keys()],
    parts,
  };
}
