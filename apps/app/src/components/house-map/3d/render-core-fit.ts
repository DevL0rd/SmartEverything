import { Ray, Vector3, type Camera } from 'three';
import type { EditEvent, EditFrame } from './map-3d-edit-protocol';
import type { Vec3 } from './mesh';
import type { Point } from './render-core-gestures';
import { planeAt, screenRay } from './edit/ground';
import type { GizmoView } from './edit/gizmo';
import type { Disc } from './edit/overlay-model';
import { screenAll, selectionPoints } from './edit/overlay-surfaces';
import type { ScreenBounds } from './edit/pointer-scene';
import {
  buildCamera,
  clampTarget,
  pointerToNdc,
  presetOrbit,
  visibleBand,
  visibleInsets,
  type CameraView,
  type OrbitState,
} from './render-core-orbit';
import type { SceneFrame } from './vacuum-geometry';

const FIT_MARGIN = 0.9;

const FIT_STEPS = 18;

const FIT_NEAREST = 0.2;

const CENTRING_PASSES = 2;

type Corner = readonly [number, number, number];

function fitsAll(
  state: OrbitState,
  corners: readonly Corner[],
  view: CameraView,
  frame: SceneFrame,
): boolean {
  const camera = buildCamera(state, view, frame);
  const band = visibleBand(view);
  const point = new Vector3();
  return corners.every((corner) => {
    point.set(...corner).project(camera);
    return (
      Math.abs(point.x) <= FIT_MARGIN &&
      Math.abs(point.y - band.centre) <= FIT_MARGIN * band.half &&
      point.z < 1
    );
  });
}

function fitDistanceTo(
  state: OrbitState,
  corners: readonly Corner[],
  view: CameraView,
  frame: SceneFrame,
): OrbitState {
  let far = state.distance;
  for (
    let grow = 0;
    grow < FIT_STEPS && !fitsAll({ ...state, distance: far }, corners, view, frame);
    grow += 1
  ) {
    far *= 2;
  }
  let near = far * FIT_NEAREST;
  for (let step = 0; step < FIT_STEPS; step += 1) {
    const middle = (near + far) / 2;
    if (fitsAll({ ...state, distance: middle }, corners, view, frame)) {
      far = middle;
    } else {
      near = middle;
    }
  }
  return { ...state, distance: far };
}

function centredOn(
  state: OrbitState,
  corners: readonly Corner[],
  view: CameraView,
  frame: SceneFrame,
): OrbitState {
  const camera = buildCamera(state, view, frame);
  const projected = corners.map((corner) => new Vector3(...corner).project(camera));
  const xs = projected.map((point) => point.x);
  const ys = projected.map((point) => point.y);
  const middle = new Vector3(
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...ys) + Math.max(...ys)) / 2,
    0.5,
  ).unproject(camera);
  const origin = camera.position.clone();
  const ray = new Ray(origin, middle.sub(origin).normalize());
  const along = ray.direction.y === 0 ? null : (state.target[1] - origin.y) / ray.direction.y;
  if (along === null || along <= 0) return state;
  const hit = ray.at(along, new Vector3());
  return { ...state, target: [hit.x, state.target[1], hit.z] };
}

export function fitToCorners(
  state: OrbitState,
  corners: readonly Corner[],
  view: CameraView,
  frame: SceneFrame,
): OrbitState {
  if (corners.length === 0) return state;
  let fitted = fitDistanceTo(state, corners, view, frame);
  for (let pass = 0; pass < CENTRING_PASSES; pass += 1) {
    fitted = fitDistanceTo(
      { ...centredOn(fitted, corners, view, frame), distance: state.distance },
      corners,
      view,
      frame,
    );
  }
  return fitted;
}

export type CameraSteer =
  | { readonly kind: 'frame'; readonly corners: readonly Vec3[]; readonly top: boolean }
  | { readonly kind: 'shift'; readonly by: readonly [number, number] };

export interface SteerContext {
  readonly view: CameraView;
  readonly frame: SceneFrame;
}

export function steerOrbit(
  state: OrbitState,
  steer: CameraSteer,
  context: SteerContext,
): OrbitState {
  const { view, frame } = context;
  if (steer.kind === 'shift') {
    const [dx, dz] = steer.by;
    return { ...state, target: clampTarget(state.target[0] + dx, state.target[2] + dz, frame) };
  }
  const start = steer.top
    ? { ...presetOrbit('top', frame, view.width / Math.max(view.height, 1)), target: state.target }
    : state;
  return fitToCorners(start, steer.corners, view, frame);
}

export interface StageBox {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export function stageBoxOf(view: CameraView): StageBox {
  const { top, bottom } = visibleInsets(view);
  return { left: 0, right: view.width, top, bottom: view.height - bottom };
}

function axisShift(low: number, high: number, from: number, to: number): number {
  if (high - low > to - from) return (from + to) / 2 - (low + high) / 2;
  if (low < from) return from - low;
  return high > to ? to - high : 0;
}

export function revealShift(discs: readonly Disc[], stage: StageBox): Point {
  if (discs.length === 0) return { x: 0, y: 0 };
  const left = Math.min(...discs.map((disc) => disc.x - disc.r));
  const right = Math.max(...discs.map((disc) => disc.x + disc.r));
  const top = Math.min(...discs.map((disc) => disc.y - disc.r));
  const bottom = Math.max(...discs.map((disc) => disc.y + disc.r));
  return {
    x: axisShift(left, right, stage.left, stage.right),
    y: axisShift(top, bottom, stage.top, stage.bottom),
  };
}

export interface ShiftView {
  readonly camera: Camera;
  readonly bounds: ScreenBounds;
  readonly elevation: number;
}

function groundAt(view: ShiftView, local: Point): Vec3 | null {
  const client = { x: view.bounds.left + local.x, y: view.bounds.top + local.y };
  const hit = planeAt(screenRay(view.camera, pointerToNdc(client, view.bounds)), view.elevation);
  return hit === null ? null : hit.world;
}

export function groundShift(
  view: ShiftView,
  anchor: Point,
  shift: Point,
): readonly [number, number] | null {
  if (shift.x === 0 && shift.y === 0) return null;
  const from = groundAt(view, anchor);
  const to = groundAt(view, { x: anchor.x + shift.x, y: anchor.y + shift.y });
  if (from === null || to === null) return null;
  return [from[0] - to[0], from[2] - to[2]];
}

export function frameSteer(frame: EditFrame | null, level: number): CameraSteer | null {
  if (frame === null) return null;
  const { minX, minY, maxX, maxY } = frame.bounds;
  const corners = [
    [minX, level, -minY],
    [maxX, level, -minY],
    [maxX, level, -maxY],
    [minX, level, -maxY],
  ] as const;
  return { kind: 'frame', corners, top: frame.top };
}

type AnchorRect = Extract<EditEvent, { type: 'anchor' }>['rect'];

export function anchorRectOf(view: GizmoView): AnchorRect {
  const points = screenAll(view, selectionPoints(view.edit, view.overlay.selection));
  if (points.length === 0) return null;
  const xs = points.map((point) => Math.round(point.x));
  const ys = points.map((point) => Math.round(point.y));
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
