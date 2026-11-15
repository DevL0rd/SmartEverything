import { Box3, InstancedMesh, Mesh, Sprite, Vector3, type Camera, type Object3D } from 'three';
import { SILHOUETTE_WIDTH_PX } from '../../../components/models/three/silhouette';
import type { BakePoint, BakeRect } from './bake-protocol';

export interface CanvasSize {
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
}

export type PassRole = 'show' | 'depth' | 'white' | 'skip';

export type Pass = (node: Object3D) => PassRole;

export interface PixelRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function isRenderable(node: Object3D): node is Mesh | Sprite {
  return node instanceof Mesh || node instanceof Sprite;
}

export function drawnNodes(root: Object3D): (Mesh | Sprite)[] {
  const found: (Mesh | Sprite)[] = [];
  root.traverse((node) => {
    if (isRenderable(node)) found.push(node);
  });
  return found;
}

export function projectPoint(
  point: Vector3,
  camera: Camera,
  width: number,
  height: number,
): BakePoint {
  const ndc = point.clone().project(camera);
  return { x: ((ndc.x + 1) / 2) * width, y: ((1 - ndc.y) / 2) * height };
}

export function projectRect(
  points: readonly Vector3[],
  camera: Camera,
  width: number,
  height: number,
): BakeRect {
  const shown = points.map((point) => projectPoint(point, camera, width, height));
  const xs = shown.map((point) => point.x);
  const ys = shown.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function shownInScene(node: Object3D): boolean {
  for (let at: Object3D | null = node; at !== null; at = at.parent) if (!at.visible) return false;
  return true;
}

function meshBox(node: Mesh): Box3 {
  if (node instanceof InstancedMesh) node.computeBoundingBox();
  else if (node.geometry.boundingBox === null) node.geometry.computeBoundingBox();
  const local = node instanceof InstancedMesh ? node.boundingBox : node.geometry.boundingBox;
  if (local === null) throw new Error(`the bake could not measure ${node.name}`);
  return local.clone().applyMatrix4(node.matrixWorld);
}

function spriteBox(node: Sprite): Box3 {
  const scale = node.getWorldScale(new Vector3());
  const reach = Math.max(Math.abs(scale.x), Math.abs(scale.y)) * Math.SQRT2;
  return new Box3().setFromCenterAndSize(
    node.getWorldPosition(new Vector3()),
    new Vector3().setScalar(reach),
  );
}

function drawnBox(node: Mesh | Sprite): Box3 {
  return node instanceof Sprite ? spriteBox(node) : meshBox(node);
}

function boxCorners(bounds: Box3): Vector3[] {
  const { min, max } = bounds;
  const out: Vector3[] = [];
  for (const x of [min.x, max.x])
    for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) out.push(new Vector3(x, y, z));
  return out;
}

export function pixelBounds(bounds: Box3, camera: Camera, canvas: CanvasSize): PixelRect | null {
  if (bounds.isEmpty()) return null;
  const corners = boxCorners(bounds);
  const clipped = corners.some((corner) => Math.abs(corner.clone().project(camera).z) > 1);
  const rect = clipped
    ? { x: 0, y: 0, width: canvas.width, height: canvas.height }
    : projectRect(corners, camera, canvas.width, canvas.height);
  const pad = Math.ceil(SILHOUETTE_WIDTH_PX * canvas.dpr) + 1;
  const left = Math.max(0, Math.floor(rect.x) - pad);
  const top = Math.max(0, Math.floor(rect.y) - pad);
  const right = Math.min(canvas.width, Math.ceil(rect.x + rect.width) + pad);
  const bottom = Math.min(canvas.height, Math.ceil(rect.y + rect.height) + pad);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function passBounds(
  scene: Object3D,
  camera: Camera,
  pass: Pass,
  canvas: CanvasSize,
): PixelRect | null {
  scene.updateMatrixWorld(true);
  const bounds = new Box3();
  for (const node of drawnNodes(scene)) {
    const role = pass(node);
    if ((role === 'show' || role === 'white') && shownInScene(node)) bounds.union(drawnBox(node));
  }
  return pixelBounds(bounds, camera, canvas);
}
