import { Raycaster, Vector2, Vector3, type Camera, type Ray } from 'three';
import type { RenderPoint } from '../../render-scene';
import type { EditSurface } from '../map-3d-edit-protocol';
import type { Vec3 } from '../mesh';
import type { Ndc, Viewport } from '../render-core-orbit';

const PARALLEL_EPS = 1e-9;

export interface WallLine {
  readonly from: RenderPoint;
  readonly to: RenderPoint;
  readonly height: number;
}

export interface SurfaceContext {
  readonly elevation: number;
  readonly ceilingHeight: number;
  readonly wall: (wallId: string) => WallLine | null;
  readonly tableTop: (objectId: string) => number | null;
}

export interface FlatHit {
  readonly kind: 'flat';
  readonly surface: EditSurface;
  readonly world: Vec3;
  readonly at: RenderPoint;
  readonly height: number;
  readonly distance: number;
}

export interface WallHit {
  readonly kind: 'wall';
  readonly surface: EditSurface;
  readonly world: Vec3;
  readonly at: RenderPoint;
  readonly u: number;
  readonly v: number;
  readonly distance: number;
}

export type SurfaceHit = FlatHit | WallHit;

export function screenRay(camera: Camera, ndc: Ndc): Ray {
  const caster = new Raycaster();
  caster.setFromCamera(new Vector2(ndc.x, ndc.y), camera);
  return caster.ray;
}

export function screenNdc(camera: Camera, world: Vec3): Ndc | null {
  const point = new Vector3(...world);
  if (point.clone().applyMatrix4(camera.matrixWorldInverse).z >= 0) return null;
  point.project(camera);
  return { x: point.x, y: point.y };
}

function worldOf(at: RenderPoint, y: number): Vec3 {
  return [at.x, y, -at.y];
}

export function planeAt(
  ray: Ray,
  y: number,
): { readonly world: Vec3; readonly distance: number } | null {
  if (Math.abs(ray.direction.y) < PARALLEL_EPS) return null;
  const distance = (y - ray.origin.y) / ray.direction.y;
  if (distance <= 0) return null;
  const hit = ray.at(distance, new Vector3());
  return { world: [hit.x, hit.y, hit.z], distance };
}

function flatHit(
  ray: Ray,
  surface: EditSurface,
  elevation: number,
  height: number,
): FlatHit | null {
  const hit = planeAt(ray, elevation + height);
  if (hit === null) return null;
  return {
    kind: 'flat',
    surface,
    world: hit.world,
    at: { x: hit.world[0], y: -hit.world[2] },
    height,
    distance: hit.distance,
  };
}

interface WallFrame {
  readonly wall: WallLine;
  readonly length: number;
  readonly dir: RenderPoint;
}

function wallFrame(wall: WallLine): WallFrame | null {
  const length = Math.hypot(wall.to.x - wall.from.x, wall.to.y - wall.from.y);
  if (length < PARALLEL_EPS) return null;
  return {
    wall,
    length,
    dir: { x: (wall.to.x - wall.from.x) / length, y: (wall.to.y - wall.from.y) / length },
  };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function wallPoint(
  ray: Ray,
  surface: EditSurface,
  frame: WallFrame,
  hit: { readonly u: number; readonly v: number; readonly elevation: number },
): WallHit {
  const { wall } = frame;
  const u = clamp(hit.u, 0, frame.length);
  const v = clamp(hit.v, 0, wall.height);
  const at = { x: wall.from.x + frame.dir.x * u, y: wall.from.y + frame.dir.y * u };
  const world = worldOf(at, hit.elevation + v);
  return {
    kind: 'wall',
    surface,
    world,
    at,
    u,
    v,
    distance: new Vector3(...world).distanceTo(ray.origin),
  };
}

export function wallPlaneHit(
  ray: Ray,
  surface: EditSurface,
  wall: WallLine,
  elevation: number,
): WallHit | null {
  const frame = wallFrame(wall);
  if (frame === null) return null;
  const normal = new Vector3(-frame.dir.y, 0, -frame.dir.x);
  const facing = normal.dot(ray.direction);
  if (Math.abs(facing) < PARALLEL_EPS) return null;
  const origin = new Vector3(...worldOf(wall.from, elevation));
  const distance = origin.clone().sub(ray.origin).dot(normal) / facing;
  if (distance <= 0) return null;
  const hit = ray.at(distance, new Vector3());
  const u = (hit.x - wall.from.x) * frame.dir.x + (-hit.z - wall.from.y) * frame.dir.y;
  return wallPoint(ray, surface, frame, { u, v: hit.y - elevation, elevation });
}

export function alongWallHit(
  ray: Ray,
  surface: EditSurface,
  wall: WallLine,
  elevation: number,
): WallHit | null {
  const frame = wallFrame(wall);
  if (frame === null) return null;
  const v = wall.height / 2;
  const lineOrigin = new Vector3(...worldOf(wall.from, elevation + v));
  const lineDir = new Vector3(frame.dir.x, 0, -frame.dir.y);
  const offset = ray.origin.clone().sub(lineOrigin);
  const b = ray.direction.dot(lineDir);
  const d = ray.direction.dot(offset);
  const e = lineDir.dot(offset);
  const denominator = 1 - b * b;
  if (denominator < PARALLEL_EPS) return null;
  const along = (b * e - d) / denominator;
  if (along <= 0) return null;
  const u = (e - b * d) / denominator;
  return wallPoint(ray, surface, frame, { u, v, elevation });
}

export function surfaceHit(
  ray: Ray,
  surface: EditSurface,
  context: SurfaceContext,
): SurfaceHit | null {
  switch (surface.kind) {
    case 'ground':
      return flatHit(ray, surface, context.elevation, 0);
    case 'ceiling':
      return flatHit(ray, surface, context.elevation, context.ceilingHeight);
    case 'table': {
      const top = context.tableTop(surface.objectId);
      return top === null ? null : flatHit(ray, surface, context.elevation, top);
    }
    case 'wall': {
      const wall = context.wall(surface.wallId);
      return wall === null ? null : wallPlaneHit(ray, surface, wall, context.elevation);
    }
    case 'along-wall': {
      const wall = context.wall(surface.wallId);
      return wall === null ? null : alongWallHit(ray, surface, wall, context.elevation);
    }
  }
}

export function metresPerPxAt(camera: Camera, world: Vec3, viewport: Viewport): number | null {
  const point = new Vector3(...world);
  const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  const start = screenNdc(camera, world);
  const end = screenNdc(camera, [point.x + right.x, point.y + right.y, point.z + right.z]);
  if (start === null || end === null) return null;
  const pixels = Math.hypot(
    ((end.x - start.x) * viewport.width) / 2,
    ((end.y - start.y) * viewport.height) / 2,
  );
  return pixels < PARALLEL_EPS ? null : 1 / pixels;
}

export function metresForPixels(
  camera: Camera,
  world: Vec3,
  viewport: Viewport,
  pixels: number,
): number | null {
  const perPixel = metresPerPxAt(camera, world, viewport);
  return perPixel === null ? null : perPixel * pixels;
}
