import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  PerspectiveCamera,
  SRGBColorSpace,
  Vector3,
  type Ray,
} from 'three';
import { screenRay } from './edit/ground';
import type { Vec3 } from './mesh';
import type { MeshLayer, RoomRange, SceneFrame } from './vacuum-geometry';

export const CAMERA_PRESET_IDS = ['angled', 'top', 'side'] as const;

export type CameraPresetId = (typeof CAMERA_PRESET_IDS)[number];

export const FIELD_OF_VIEW_DEGREES = 40;

export const TOP_FOV_DEG = 20;

export const MAX_PIXEL_RATIO = 2;

export const ORBIT_RADIANS_PER_PIXEL = 0.006;

export const WHEEL_ZOOM_PER_UNIT = 0.0015;

const MIN_POLAR = 0.02;

const MAX_POLAR = Math.PI / 2 - 0.05;

const MIN_DISTANCE_FACTOR = 0.35;

const MAX_DISTANCE_FACTOR = 3;

const NEAR_METRES = 0.05;

const FAR_FACTOR = 8;

const PRESET_ANGLES: Readonly<Record<CameraPresetId, { azimuth: number; polar: number }>> = {
  angled: { azimuth: Math.PI / 5, polar: 0.95 },
  top: { azimuth: 0, polar: 0 },
  side: { azimuth: 0, polar: 1.35 },
};

export const FOLLOW_SHARE_OF_FIT = 0.6;

export function followDistance(fitted: OrbitState): number {
  return fitted.distance * FOLLOW_SHARE_OF_FIT;
}

export interface OrbitState {
  readonly azimuth: number;
  readonly polar: number;
  readonly distance: number;
  readonly target: readonly [number, number, number];
  readonly top: boolean;
}

export function fieldOfView(state: Pick<OrbitState, 'top'>): number {
  return state.top ? TOP_FOV_DEG : FIELD_OF_VIEW_DEGREES;
}

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

export interface ViewInsets {
  readonly top: number;
  readonly bottom: number;
}

export const NO_INSETS: ViewInsets = { top: 0, bottom: 0 };

export interface CameraView extends Viewport {
  readonly insets: ViewInsets;
}

export interface VisibleBand {
  readonly centre: number;
  readonly half: number;
}

export function visibleInsets(view: CameraView): ViewInsets {
  const { top, bottom } = view.insets;
  return top + bottom < view.height ? view.insets : NO_INSETS;
}

export function visibleBand(view: CameraView): VisibleBand {
  const { top, bottom } = visibleInsets(view);
  return { centre: (bottom - top) / view.height, half: 1 - (top + bottom) / view.height };
}

export function clampPixelRatio(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return 1;
  return Math.min(ratio, MAX_PIXEL_RATIO);
}

export function fitDistance(radius: number, aspect: number, fovDegrees: number): number {
  const vertical = (fovDegrees * Math.PI) / 360;
  const horizontal = Math.atan(Math.tan(vertical) * Math.max(aspect, 0.01));
  return radius / Math.sin(Math.min(vertical, horizontal));
}

export function presetOrbit(id: CameraPresetId, frame: SceneFrame, aspect: number): OrbitState {
  const angles = PRESET_ANGLES[id];
  const top = id === 'top';
  return {
    azimuth: angles.azimuth,
    polar: angles.polar,
    distance: fitDistance(frame.radius, aspect, fieldOfView({ top })),
    target: frame.centre,
    top,
  };
}

export function followOrbit(
  state: OrbitState,
  position: readonly [number, number, number],
  distance: number = state.distance,
): OrbitState {
  return { ...state, target: [position[0], 0, position[2]], distance };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

export function orbitDrag(state: OrbitState, dx: number, dy: number): OrbitState {
  const azimuth = state.azimuth - dx * ORBIT_RADIANS_PER_PIXEL;
  if (state.top) return { ...state, azimuth };
  return {
    ...state,
    azimuth,
    polar: clamp(state.polar - dy * ORBIT_RADIANS_PER_PIXEL, MIN_POLAR, MAX_POLAR),
  };
}

export function orbitZoom(
  state: OrbitState,
  factor: number,
  frame: SceneFrame,
  aspect: number,
): OrbitState {
  const fit = fitDistance(frame.radius, aspect, fieldOfView(state));
  return {
    ...state,
    distance: clamp(state.distance / factor, fit * MIN_DISTANCE_FACTOR, fit * MAX_DISTANCE_FACTOR),
  };
}

export interface PanContext {
  readonly viewport: Viewport;
  readonly frame: SceneFrame;
}

export function orbitPan(
  state: OrbitState,
  delta: { readonly dx: number; readonly dy: number },
  context: PanContext,
): OrbitState {
  const { dx, dy } = delta;
  const { viewport, frame } = context;
  const metresPerPixel =
    (2 * state.distance * Math.tan((fieldOfView(state) * Math.PI) / 360)) /
    Math.max(viewport.height, 1);
  const sine = Math.sin(state.azimuth);
  const cosine = Math.cos(state.azimuth);
  const [x, , z] = state.target;
  const nextX = x - cosine * dx * metresPerPixel - sine * dy * metresPerPixel;
  const nextZ = z + sine * dx * metresPerPixel - cosine * dy * metresPerPixel;
  return { ...state, target: clampTarget(nextX, nextZ, frame) };
}

export function clampTarget(
  x: number,
  z: number,
  frame: SceneFrame,
): readonly [number, number, number] {
  const [centreX, , centreZ] = frame.centre;
  return [
    clamp(x, centreX - frame.radius, centreX + frame.radius),
    0,
    clamp(z, centreZ - frame.radius, centreZ + frame.radius),
  ];
}

export interface Ndc {
  readonly x: number;
  readonly y: number;
}

function groundUnder(
  state: OrbitState,
  ndc: Ndc,
  view: CameraView,
  frame: SceneFrame,
): Vector3 | null {
  const ray = screenRay(buildCamera(state, view, frame), ndc);
  if (ray.direction.y >= 0) return null;
  return ray.at((state.target[1] - ray.origin.y) / ray.direction.y, new Vector3());
}

export function orbitZoomAt(
  state: OrbitState,
  factor: number,
  ndc: Ndc,
  context: { readonly view: CameraView; readonly frame: SceneFrame },
): OrbitState {
  const { view, frame } = context;
  const zoomed = orbitZoom(state, factor, frame, view.width / Math.max(view.height, 1));
  const before = groundUnder(state, ndc, view, frame);
  const after = groundUnder(zoomed, ndc, view, frame);
  if (before === null || after === null) return zoomed;
  return {
    ...zoomed,
    target: clampTarget(
      zoomed.target[0] + before.x - after.x,
      zoomed.target[2] + before.z - after.z,
      frame,
    ),
  };
}

export function orbitPosition(state: OrbitState): readonly [number, number, number] {
  const flat = Math.sin(state.polar) * state.distance;
  return [
    state.target[0] + flat * Math.sin(state.azimuth),
    state.target[1] + Math.cos(state.polar) * state.distance,
    state.target[2] + flat * Math.cos(state.azimuth),
  ];
}

export function orbitUp(state: OrbitState): readonly [number, number, number] {
  const level = Math.cos(state.polar);
  return [
    -level * Math.sin(state.azimuth),
    Math.sin(state.polar),
    -level * Math.cos(state.azimuth),
  ];
}

export function buildCamera(
  state: OrbitState,
  view: CameraView,
  frame: SceneFrame,
): PerspectiveCamera {
  const camera = new PerspectiveCamera(
    fieldOfView(state),
    view.width / Math.max(view.height, 1),
    NEAR_METRES,
    frame.radius * FAR_FACTOR + state.distance,
  );
  const { top, bottom } = visibleInsets(view);
  if (top !== bottom) {
    camera.setViewOffset(view.width, view.height, 0, (bottom - top) / 2, view.width, view.height);
  }
  camera.position.set(...orbitPosition(state));
  camera.up.set(...orbitUp(state));
  camera.lookAt(...state.target);
  camera.updateMatrixWorld(true);
  return camera;
}

export function layerGeometry(layer: MeshLayer): BufferGeometry {
  const geometry = new BufferGeometry();
  const linear = new Float32Array(layer.colours.length);
  const colour = new Color();
  for (let index = 0; index < layer.colours.length; index += 3) {
    colour.setRGB(
      Number(layer.colours[index]),
      Number(layer.colours[index + 1]),
      Number(layer.colours[index + 2]),
      SRGBColorSpace,
    );
    linear.set([colour.r, colour.g, colour.b], index);
  }
  geometry.setAttribute('position', new BufferAttribute(layer.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(layer.normals, 3));
  geometry.setAttribute('color', new BufferAttribute(linear, 3));
  geometry.setAttribute('uv', new BufferAttribute(layer.uvs, 2));
  geometry.setIndex(new BufferAttribute(layer.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

export function roomOfFace(ranges: readonly RoomRange[], face: number): string | null {
  const range = ranges.find(
    (candidate) =>
      face >= candidate.firstTriangle && face < candidate.firstTriangle + candidate.triangleCount,
  );
  return range?.roomId ?? null;
}

export interface PickTargets {
  readonly floor: MeshLayer | null;
  readonly walls: MeshLayer | null;
  readonly ranges: readonly RoomRange[];
}

export interface RayHit {
  readonly distance: number;
  readonly triangle: number;
}

function corner(layer: MeshLayer, vertex: number, target: Vector3): Vector3 {
  return target.set(
    Number(layer.positions[vertex * 3]),
    Number(layer.positions[vertex * 3 + 1]),
    Number(layer.positions[vertex * 3 + 2]),
  );
}

export function nearestHit(ray: Ray, layer: MeshLayer): RayHit | null {
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const point = new Vector3();
  let best: RayHit | null = null;
  for (let triangle = 0; triangle < layer.triangles; triangle += 1) {
    corner(layer, Number(layer.indices[triangle * 3]), a);
    corner(layer, Number(layer.indices[triangle * 3 + 1]), b);
    corner(layer, Number(layer.indices[triangle * 3 + 2]), c);
    if (ray.intersectTriangle(a, b, c, false, point) === null) continue;
    const distance = point.distanceTo(ray.origin);
    if (best === null || distance < best.distance) best = { distance, triangle };
  }
  return best;
}

export interface SceneFraming {
  readonly frame: SceneFrame;
  readonly extent: readonly Vec3[];
}

function roomBox(targets: Pick<PickTargets, 'floor' | 'ranges'>, roomIds: Set<string>): Box3 {
  const box = new Box3();
  const { floor } = targets;
  if (floor === null) return box;
  const point = new Vector3();
  for (const range of targets.ranges.filter((candidate) => roomIds.has(candidate.roomId))) {
    const end = (range.firstTriangle + range.triangleCount) * 3;
    for (let index = range.firstTriangle * 3; index < end; index += 1) {
      box.expandByPoint(corner(floor, Number(floor.indices[index]), point));
    }
  }
  return box;
}

export function frameRoom(
  targets: Pick<PickTargets, 'floor' | 'ranges'>,
  roomIds: readonly string[],
  whole: SceneFraming,
): SceneFraming {
  const box = roomBox(targets, new Set(roomIds));
  const { min, max } = box;
  const radius = Math.hypot(max.x - min.x, max.z - min.z) / 2;
  if (box.isEmpty() || radius === 0) return whole;
  const top = whole.extent.reduce((height, [, y]) => Math.max(height, y), 0);
  return {
    frame: { centre: [(min.x + max.x) / 2, 0, (min.z + max.z) / 2], radius },
    extent: [0, top].flatMap((y): Vec3[] => [
      [min.x, y, min.z],
      [max.x, y, min.z],
      [min.x, y, max.z],
      [max.x, y, max.z],
    ]),
  };
}

export function pickRoom(
  camera: PerspectiveCamera,
  ndc: { readonly x: number; readonly y: number },
  targets: PickTargets,
): string | null {
  if (targets.floor === null) return null;
  const ray = screenRay(camera, ndc);
  const floorHit = nearestHit(ray, targets.floor);
  if (floorHit === null) return null;
  const wallHit = targets.walls === null ? null : nearestHit(ray, targets.walls);
  if (wallHit !== null && wallHit.distance < floorHit.distance) return null;
  return roomOfFace(targets.ranges, floorHit.triangle);
}

export function pointerToNdc(
  point: { readonly x: number; readonly y: number },
  bounds: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  },
): { readonly x: number; readonly y: number } {
  return {
    x: ((point.x - bounds.left) / Math.max(bounds.width, 1)) * 2 - 1,
    y: -(((point.y - bounds.top) / Math.max(bounds.height, 1)) * 2 - 1),
  };
}
