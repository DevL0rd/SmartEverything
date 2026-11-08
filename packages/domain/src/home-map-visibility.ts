import type { HomeMapAutoFactsFn } from './home-map-auto-place-types';
import type { HOME_MAP_OPENING_KINDS, HOME_MAP_WALL_KINDS } from './home-map-elements';
import {
  homeMapDistance,
  homeMapWallLength,
  homeMapWallPointAt,
  type HomeMapSegmentShape,
  type HomeMapVec,
} from './home-map-geometry';
import type { HomeMapCamera, HomeMapPlacement } from './home-map-placement';

export const HOME_MAP_CAMERA_FOV_DEFAULT = { hfovDeg: 100, vfovDeg: 56, rangeM: 8 } as const;

export const HOME_MAP_VISIBILITY_ARC_STEP_DEG = 3;

export const HOME_MAP_LIVE_ANGLE_MODELS: readonly string[] = [];

export interface HomeMapVisibilityWall extends HomeMapSegmentShape {
  readonly id: string;
  readonly kind: (typeof HOME_MAP_WALL_KINDS)[number];
  readonly height: number | null;
}

export interface HomeMapVisibilityOpening {
  readonly wallId: string;
  readonly offset: number;
  readonly width: number;
  readonly seeThrough: boolean;
}

export interface HomeMapVisibilityInput {
  readonly at: HomeMapVec;
  readonly yawDeg: number;
  readonly hfovDeg: number;
  readonly rangeM: number;
  readonly heightM: number;
  readonly walls: readonly HomeMapVisibilityWall[];
  readonly openings?: readonly HomeMapVisibilityOpening[];
  readonly arcStepDeg?: number;
}

export interface HomeMapCameraDirection {
  readonly yawDeg: number;
  readonly tiltDeg: number;
  readonly known: boolean;
}

export interface HomeMapPtzState {
  readonly preset: string | null;
  readonly live: { readonly yawDeg: number; readonly tiltDeg: number } | null;
  readonly moveUncertain: boolean;
}

export interface HomeMapFrustumOutline {
  readonly apex: { readonly x: number; readonly y: number; readonly z: number };
  readonly direction: HomeMapCameraDirection;
  readonly ring: readonly HomeMapVec[];
  readonly floorM: number;
  readonly topM: number;
}

export interface HomeMapCameraView {
  readonly direction: HomeMapCameraDirection;
  readonly polygon: readonly HomeMapVec[];
  readonly frustum: HomeMapFrustumOutline;
  readonly dashed: boolean;
}

export interface HomeMapCameraScene {
  readonly walls: readonly HomeMapVisibilityWall[];
  readonly openings: readonly HomeMapVisibilityOpening[];
}

export type HomeMapPanMode = HomeMapCamera['pan']['mode'];

const HIT_EPS = 1e-9;
const ANGLE_EPS_RAD = 1e-6;
const RAD = Math.PI / 180;

export const homeMapModelReportsAngle = (model: string): boolean =>
  HOME_MAP_LIVE_ANGLE_MODELS.includes(model);

export const homeMapAvailablePanModes = (camera: {
  readonly model: string;
  readonly presets: boolean;
}): readonly HomeMapPanMode[] => [
  'fixed',
  ...(camera.presets ? (['presets'] as const) : []),
  ...(homeMapModelReportsAngle(camera.model) ? (['live'] as const) : []),
];

export const homeMapCameraDefaults = (
  facts: HomeMapAutoFactsFn,
  modelId: string,
  yawDeg: number,
): HomeMapCamera => {
  const known = facts(modelId).fov;
  const fov = known
    ? { hfovDeg: known.hDeg, vfovDeg: known.vDeg, rangeM: known.rangeM }
    : HOME_MAP_CAMERA_FOV_DEFAULT;
  return {
    ...fov,
    fovSource: known?.exact === true ? 'exact' : 'estimated',
    pan: { mode: 'fixed', yawDeg, presets: {} },
    showCone: true,
  };
};

export const homeMapCameraDirection = (
  placement: HomeMapPlacement,
  ptz: HomeMapPtzState,
): HomeMapCameraDirection | null => {
  const camera = placement.camera;
  if (!camera) return null;
  const stored = { yawDeg: camera.pan.yawDeg, tiltDeg: placement.tilt };
  if (camera.pan.mode === 'live') {
    return ptz.live ? { ...ptz.live, known: true } : { ...stored, known: false };
  }
  if (camera.pan.mode === 'presets') {
    const preset = ptz.preset === null ? undefined : camera.pan.presets[ptz.preset];
    return preset
      ? { yawDeg: preset.yawDeg, tiltDeg: preset.tiltDeg, known: !ptz.moveUncertain }
      : { ...stored, known: false };
  }
  return { ...stored, known: !ptz.moveUncertain };
};

export const homeMapOpeningSeeThrough = (
  kind: (typeof HOME_MAP_OPENING_KINDS)[number],
  open: boolean | null,
): boolean => kind === 'opening' || kind === 'window' || open === true;

const blocksView = (wall: HomeMapVisibilityWall, heightM: number): boolean =>
  (wall.kind === 'solid' || wall.kind === 'half') &&
  (wall.height === null || wall.height >= heightM);

const openSpans = (
  wall: HomeMapVisibilityWall,
  openings: readonly HomeMapVisibilityOpening[],
): readonly (readonly [number, number])[] => {
  const length = homeMapWallLength(wall);
  const spans = openings
    .filter((opening) => opening.wallId === wall.id && opening.seeThrough)
    .map((opening) => [
      Math.max(0, opening.offset),
      Math.min(length, opening.offset + opening.width),
    ])
    .flatMap(([lo, hi]) =>
      lo !== undefined && hi !== undefined && hi > lo ? [[lo, hi] as const] : [],
    );
  return spans.sort((a, b) => a[0] - b[0]);
};

const solidSpans = (
  length: number,
  gaps: readonly (readonly [number, number])[],
): readonly (readonly [number, number])[] => {
  const solid: (readonly [number, number])[] = [];
  let cursor = 0;
  for (const [lo, hi] of gaps) {
    if (lo > cursor) solid.push([cursor, lo]);
    cursor = Math.max(cursor, hi);
  }
  if (length > cursor) solid.push([cursor, length]);
  return solid;
};

export const homeMapBlockingSegments = (
  walls: readonly HomeMapVisibilityWall[],
  openings: readonly HomeMapVisibilityOpening[],
  heightM: number,
): readonly HomeMapSegmentShape[] =>
  walls.flatMap((wall) => {
    if (!blocksView(wall, heightM)) return [];
    return solidSpans(homeMapWallLength(wall), openSpans(wall, openings)).map(([lo, hi]) => ({
      from: homeMapWallPointAt(wall, lo),
      to: homeMapWallPointAt(wall, hi),
    }));
  });

const rayDistance = (
  origin: HomeMapVec,
  dx: number,
  dy: number,
  segment: HomeMapSegmentShape,
): number | null => {
  const ex = segment.to.x - segment.from.x;
  const ey = segment.to.y - segment.from.y;
  const denom = dx * ey - dy * ex;
  if (Math.abs(denom) < 1e-12) return null;
  const wx = segment.from.x - origin.x;
  const wy = segment.from.y - origin.y;
  const t = (wx * ey - wy * ex) / denom;
  const u = (wx * dy - wy * dx) / denom;
  return t > HIT_EPS && u >= -HIT_EPS && u <= 1 + HIT_EPS ? t : null;
};

const castRay = (
  origin: HomeMapVec,
  angleRad: number,
  rangeM: number,
  segments: readonly HomeMapSegmentShape[],
): HomeMapVec => {
  const dx = Math.cos(angleRad);
  const dy = Math.sin(angleRad);
  let reach = rangeM;
  for (const segment of segments) {
    const t = rayDistance(origin, dx, dy, segment);
    if (t !== null && t < reach) reach = t;
  }
  return { x: origin.x + dx * reach, y: origin.y + dy * reach };
};

const wrapDeg = (degrees: number): number => ((((degrees + 180) % 360) + 360) % 360) - 180;

const sweepOffsets = (
  input: HomeMapVisibilityInput,
  segments: readonly HomeMapSegmentShape[],
): readonly number[] => {
  const half = Math.min(input.hfovDeg, 360) / 2;
  const step = input.arcStepDeg ?? HOME_MAP_VISIBILITY_ARC_STEP_DEG;
  const offsets = [-half, half];
  for (let a = -half + step; a < half; a += step) offsets.push(a);
  const eps = ANGLE_EPS_RAD / RAD;
  for (const point of segments.flatMap((s) => [s.from, s.to])) {
    if (homeMapDistance(input.at, point) > input.rangeM) continue;
    const angle = wrapDeg(
      Math.atan2(point.y - input.at.y, point.x - input.at.x) / RAD - input.yawDeg,
    );
    for (const offset of [angle - eps, angle, angle + eps]) {
      if (offset >= -half && offset <= half) offsets.push(offset);
    }
  }
  return offsets
    .sort((a, b) => a - b)
    .filter((v, i, all) => i === 0 || v - (all[i - 1] ?? v) > 1e-9);
};

export const homeMapCameraVisibility = (input: HomeMapVisibilityInput): readonly HomeMapVec[] => {
  const segments = homeMapBlockingSegments(input.walls, input.openings ?? [], input.heightM);
  const offsets = sweepOffsets(input, segments);
  const full = input.hfovDeg >= 360;
  const rim = (full ? offsets.slice(0, -1) : offsets).map((offset) =>
    castRay(input.at, (input.yawDeg + offset) * RAD, input.rangeM, segments),
  );
  return full ? rim : [input.at, ...rim];
};

export const homeMapCameraFrustum = (
  input: HomeMapVisibilityInput,
  direction: HomeMapCameraDirection,
): HomeMapFrustumOutline => ({
  apex: { x: input.at.x, y: input.at.y, z: input.heightM },
  direction,
  ring: homeMapCameraVisibility(input),
  floorM: 0,
  topM: input.heightM,
});

export const homeMapCameraView = (
  placement: HomeMapPlacement,
  ptz: HomeMapPtzState,
  scene: HomeMapCameraScene,
): HomeMapCameraView | null => {
  const direction = homeMapCameraDirection(placement, ptz);
  if (!direction || !placement.camera) return null;
  const input: HomeMapVisibilityInput = {
    at: placement.at,
    yawDeg: direction.yawDeg,
    hfovDeg: placement.camera.hfovDeg,
    rangeM: placement.camera.rangeM,
    heightM: placement.height,
    walls: scene.walls,
    openings: scene.openings,
  };
  const frustum = homeMapCameraFrustum(input, direction);
  return { direction, polygon: frustum.ring, frustum, dashed: !direction.known };
};
