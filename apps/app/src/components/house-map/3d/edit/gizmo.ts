import { Vector3, type Ray } from 'three';
import type { HomeMapVec } from '@smarteverything/domain/home-map-geometry';
import type { EditHandleTarget, EditOverlay } from '../map-3d-edit-protocol';
import type { Vec3 } from '../mesh';
import type { Point } from '../render-core-gestures';
import { metresPerPxAt, planeAt, screenNdc } from './ground';
import type { HandleCentre } from './pointer';
import { rayAt, type MoveView } from './sessions';

export type GizmoBreakpoint = 'phone' | 'tablet' | 'desktop';

export const HANDLE_TARGET_PX = { touch: 48, mouse: 44 } as const;

export interface GizmoSizes {
  readonly gizmoPx: number;
  readonly handlePx: number;
  readonly targetPx: number;
}

export const GIZMO_SIZES: Readonly<Record<GizmoBreakpoint, GizmoSizes>> = {
  phone: { gizmoPx: 68, handlePx: 24, targetPx: HANDLE_TARGET_PX.touch },
  tablet: { gizmoPx: 64, handlePx: 22, targetPx: HANDLE_TARGET_PX.touch },
  desktop: { gizmoPx: 60, handlePx: 16, targetPx: HANDLE_TARGET_PX.mouse },
};

export function handleAt(
  centres: readonly HandleCentre[],
  at: Point,
  mouse: boolean,
): string | null {
  const radius = (mouse ? HANDLE_TARGET_PX.mouse : HANDLE_TARGET_PX.touch) / 2;
  let best: { readonly id: string; readonly gap: number } | null = null;
  for (const centre of centres) {
    const gap = Math.hypot(centre.x - at.x, centre.y - at.y);
    if (gap <= radius && (best === null || gap < best.gap)) best = { id: centre.id, gap };
  }
  return best === null ? null : best.id;
}

export const AXIS_HIDE_DEG = 15;

const RIGHT_ANGLE_DEG = 90;
const DEGREES_PER_RADIAN = 180 / Math.PI;
const PARALLEL_EPS = 1e-9;

export type EditGizmo = NonNullable<EditOverlay['gizmo']>;

export type GizmoAxis = EditGizmo['axes'][number];

export type GizmoTarget = Extract<EditHandleTarget, { readonly kind: 'gizmo' }>;

export interface GizmoView extends MoveView {
  readonly overlay: EditOverlay;
  readonly breakpoint: GizmoBreakpoint;
}

export interface GizmoFrame {
  readonly id: string;
  readonly gizmo: EditGizmo;
  readonly sizes: GizmoSizes;
  readonly centre: Vec3;
  readonly screen: Point;
  readonly metres: number;
  readonly perPx: number;
  readonly east: HomeMapVec;
  readonly north: HomeMapVec;
}

export const UP: Vec3 = [0, 1, 0];

export function planDir(degrees: number): HomeMapVec {
  const turn = degrees / DEGREES_PER_RADIAN;
  return { x: Math.cos(turn), y: Math.sin(turn) };
}

export function worldOfPlan(dir: HomeMapVec): Vec3 {
  return [dir.x, 0, -dir.y];
}

export function planOfWorld(world: Vec3): HomeMapVec {
  return { x: world[0], y: -world[2] };
}

export function along(from: Vec3, dir: Vec3, metres: number): Vec3 {
  return [from[0] + dir[0] * metres, from[1] + dir[1] * metres, from[2] + dir[2] * metres];
}

export function axisDir(frame: GizmoFrame, axis: GizmoAxis): Vec3 {
  if (axis === 'z') return UP;
  return worldOfPlan(axis === 'x' ? frame.east : frame.north);
}

export function toScreen(view: GizmoView, world: Vec3): Point | null {
  const ndc = screenNdc(view.camera, world);
  if (ndc === null) return null;
  const { bounds } = view;
  return {
    x: bounds.left + ((ndc.x + 1) / 2) * bounds.width,
    y: bounds.top + ((1 - ndc.y) / 2) * bounds.height,
  };
}

export function gap(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function unit(from: Point, to: Point): Point | null {
  const length = gap(from, to);
  if (length < PARALLEL_EPS) return null;
  return { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
}

export function offsetPoint(from: Point, dir: Point, pixels: number): Point {
  return { x: from.x + dir.x * pixels, y: from.y + dir.y * pixels };
}

export function viewAngleDeg(view: GizmoView, at: Vec3, dir: Vec3): number {
  const sight = new Vector3(...at).sub(view.camera.position).normalize();
  const cosine = Math.min(1, Math.abs(sight.dot(new Vector3(...dir))));
  return Math.acos(cosine) * DEGREES_PER_RADIAN;
}

export function pointsAtCamera(view: GizmoView, at: Vec3, dir: Vec3): boolean {
  return viewAngleDeg(view, at, dir) < AXIS_HIDE_DEG;
}

export function edgeOn(view: GizmoView, at: Vec3, normal: Vec3): boolean {
  return viewAngleDeg(view, at, normal) > RIGHT_ANGLE_DEG - AXIS_HIDE_DEG;
}

export function lineParam(ray: Ray, origin: Vec3, dir: Vec3): number | null {
  const line = new Vector3(...dir);
  const offset = new Vector3(...origin).sub(ray.origin);
  const b = line.dot(ray.direction);
  const denominator = line.lengthSq() * ray.direction.lengthSq() - b * b;
  if (Math.abs(denominator) < PARALLEL_EPS) return null;
  const d = line.dot(offset);
  const e = ray.direction.dot(offset);
  return (b * e - ray.direction.lengthSq() * d) / denominator;
}

export function lineAtScreen(view: GizmoView, at: Point, origin: Vec3, dir: Vec3): Vec3 | null {
  const param = lineParam(rayAt(view, at), origin, dir);
  return param === null ? null : along(origin, dir, param);
}

export function levelAtScreen(view: GizmoView, at: Point, height: number): Vec3 | null {
  return planeAt(rayAt(view, at), height)?.world ?? null;
}

function slab(start: number, dir: number, centre: number, size: number): readonly [number, number] {
  if (Math.abs(dir) < PARALLEL_EPS) {
    return Math.abs(start - centre) < size ? [-Infinity, Infinity] : [Infinity, -Infinity];
  }
  const a = (centre - size - start) / dir;
  const b = (centre + size - start) / dir;
  return a < b ? [a, b] : [b, a];
}

export interface ScreenPath {
  readonly start: Point;
  readonly dir: Point;
  readonly from: number;
}

export function clearAlong(path: ScreenPath, blockers: readonly Point[], size: number): number {
  const { start, dir, from } = path;
  const blocked = blockers
    .map((blocker) => {
      const [xLow, xHigh] = slab(start.x, dir.x, blocker.x, size);
      const [yLow, yHigh] = slab(start.y, dir.y, blocker.y, size);
      return { low: Math.max(xLow, yLow), high: Math.min(xHigh, yHigh) };
    })
    .filter((span) => span.low < span.high)
    .sort((a, b) => a.low - b.low);
  let reach = from;
  for (const span of blocked) if (span.low < reach && reach < span.high) reach = span.high;
  return reach;
}

function onlySelected(overlay: EditOverlay): string | null {
  const [only, ...rest] = overlay.selection;
  return only === undefined || rest.length > 0 ? null : only;
}

export function gizmoFrameOf(view: GizmoView): GizmoFrame | null {
  const { overlay } = view;
  const id = onlySelected(overlay);
  const { gizmo } = overlay;
  if (id === null || gizmo === null || overlay.readOnly || overlay.mode !== 'select') return null;
  const centre: Vec3 = [
    gizmo.centre.x,
    view.edit.floor.elevation + gizmo.centre.height,
    -gizmo.centre.y,
  ];
  const screen = toScreen(view, centre);
  const perPx = metresPerPxAt(view.camera, centre, view.viewport);
  if (screen === null || perPx === null) return null;
  const sizes = GIZMO_SIZES[view.breakpoint];
  const turn = gizmo.space === 'local' ? gizmo.turn : 0;
  return {
    id,
    gizmo,
    sizes,
    centre,
    screen,
    metres: sizes.gizmoPx * perPx,
    perPx,
    east: planDir(turn),
    north: planDir(turn + RIGHT_ANGLE_DEG),
  };
}
