import {
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  type BufferGeometry,
  type Group,
  type Material,
  type Object3D,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

interface MergeBucket {
  readonly material: Material | Material[];
  readonly renderOrder: number;
  readonly geometries: BufferGeometry[];
}

export const isMesh = (node: Object3D): node is Mesh => node instanceof Mesh;

const textureKey = (texture: Texture | null): string | null =>
  texture === null
    ? null
    : [texture.name, String(texture.repeat.x), String(texture.repeat.y)].join(':');

function lookKey(look: MeshPhysicalMaterial): string {
  return JSON.stringify([
    look.type,
    look.color.getHexString(),
    look.emissive.getHexString(),
    look.emissiveIntensity,
    look.roughness,
    look.metalness,
    look.clearcoat,
    look.clearcoatRoughness,
    look.sheen,
    look.sheenRoughness,
    look.sheenColor.getHexString(),
    look.opacity,
    look.transparent,
    look.depthWrite,
    look.envMapIntensity,
    look.side,
    look.vertexColors,
    look.flatShading,
    look.bumpScale,
    textureKey(look.map),
    textureKey(look.bumpMap),
    textureKey(look.roughnessMap),
  ]);
}

function materialKey(material: Material | Material[], node: Mesh): string {
  if (Array.isArray(material)) return `own:${node.uuid}`;
  return material instanceof MeshPhysicalMaterial ? lookKey(material) : `own:${material.uuid}`;
}

function geometryKey(geometry: BufferGeometry): string {
  const attributes = Object.entries(geometry.attributes)
    .map(
      ([name, attribute]) =>
        `${name}:${String(attribute.itemSize)}:${String(attribute.normalized)}`,
    )
    .sort();
  const morphs = Object.keys(geometry.morphAttributes).sort();
  return JSON.stringify([attributes, morphs, geometry.index !== null]);
}

function collect(root: Object3D, inverse: Matrix4, buckets: Map<string, MergeBucket>): void {
  const relative = new Matrix4();
  root.traverseVisible((node) => {
    if (!isMesh(node) || node instanceof InstancedMesh) return;
    const geometry = node.geometry
      .clone()
      .applyMatrix4(relative.multiplyMatrices(inverse, node.matrixWorld));
    const key = `${String(node.renderOrder)}|${materialKey(node.material, node)}|${geometryKey(geometry)}`;
    const bucket = buckets.get(key) ?? {
      material: node.material,
      renderOrder: node.renderOrder,
      geometries: [],
    };
    bucket.geometries.push(geometry);
    buckets.set(key, bucket);
  });
}

function mergedGeometry(geometries: readonly BufferGeometry[]): BufferGeometry {
  const [only, ...rest] = geometries;
  if (only !== undefined && rest.length === 0) return only;
  const merged = mergeGeometries([...geometries], false);
  for (const geometry of geometries) geometry.dispose();
  return merged;
}

function bucketMesh(bucket: MergeBucket): Mesh {
  const mesh = new Mesh(mergedGeometry(bucket.geometries), bucket.material);
  mesh.renderOrder = bucket.renderOrder;
  return mesh;
}

export function clearMerged(merged: Group): void {
  for (const node of merged.children) if (isMesh(node)) node.geometry.dispose();
  merged.clear();
}

export function mergeStatics(target: Group, sources: readonly Object3D[], frame: Object3D): void {
  clearMerged(target);
  frame.updateMatrixWorld(true);
  const inverse = frame.matrixWorld.clone().invert();
  const buckets = new Map<string, MergeBucket>();
  for (const source of sources) collect(source, inverse, buckets);
  for (const bucket of buckets.values()) target.add(bucketMesh(bucket));
}

export interface SceneMeasure {
  readonly triangles: number;
  readonly drawCalls: number;
}

export function measure(root: Object3D): SceneMeasure {
  let triangles = 0;
  let drawCalls = 0;
  root.traverseVisible((node) => {
    if (!isMesh(node)) return;
    const copies = node instanceof InstancedMesh ? node.count : 1;
    const { index } = node.geometry;
    const corners = index === null ? node.geometry.getAttribute('position').count : index.count;
    if (copies === 0) return;
    drawCalls += 1;
    triangles += (corners / 3) * copies;
  });
  return { triangles, drawCalls };
}
