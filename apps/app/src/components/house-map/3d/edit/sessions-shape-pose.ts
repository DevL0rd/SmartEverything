import { Vector3, type Ray } from 'three';
import {
  HOME_MAP_GRID_FINE_M,
  HOME_MAP_ROTATION_STEP_DEG,
  homeMapSnapPoint,
  homeMapSnapRotation,
} from '@smarteverything/domain/home-map-edit-core';
import {
  homeMapOpeningEnds,
  homeMapProjectOnSegment,
  homeMapWallLength,
  type HomeMapVec,
} from '@smarteverything/domain/home-map-geometry';
import type { HomeMapCamera, HomeMapPlacement } from '@smarteverything/domain/home-map-placement';
import { degreesText, metresText, type Modifiers } from '../../edit/gestures';
import { SNAP_RADIUS_PX } from '../../edit/radii';
import type { EditExtent, EditHandleTarget } from '../map-3d-edit-protocol';
import type { Vec3 } from '../mesh';
import { free } from './sessions';
import { HandleDragUnavailableError } from './sessions-factory';
import {
  SHAPE_EPS,
  ShapeTargetMissingError,
  clamp,
  ghost,
  gridStep,
  label,
  minus,
  plus,
  pointOn,
  radiusAt,
  same,
  stepped,
  steppedMetres,
  type ScanPlacement,
  type ShapeFrame,
  type ShapeGrab,
  type ShapeStep,
  type ShapeView,
} from './sessions-shape-base';

const DEGREES_PER_RADIAN = 180 / Math.PI;
const PITCH_LIMIT_DEG = 90;
const PERCENT = 100;

type Target<K extends EditHandleTarget['kind']> = Extract<EditHandleTarget, { readonly kind: K }>;

type ScanGrip = 'move' | 'lift' | 'turn' | 'scale';

const SCAN_GRIPS: Readonly<Partial<Record<ShapeGrab['handle']['kind'], ScanGrip>>> = {
  plane: 'move',
  top: 'lift',
  ring: 'turn',
  uniform: 'scale',
};

function angleOf(from: HomeMapVec, to: HomeMapVec): number {
  return Math.atan2(to.y - from.y, to.x - from.x) * DEGREES_PER_RADIAN;
}

function rotated(point: HomeMapVec, degrees: number): HomeMapVec {
  const turn = degrees / DEGREES_PER_RADIAN;
  return {
    x: Math.cos(turn) * point.x - Math.sin(turn) * point.y,
    y: Math.sin(turn) * point.x + Math.cos(turn) * point.y,
  };
}

export function openingSlideStep(grab: ShapeGrab, target: Target<'opening'>): ShapeStep {
  const { floor } = grab.view.edit;
  const opening = floor.openings.find((each) => each.id === target.openingId);
  if (opening === undefined) throw new ShapeTargetMissingError('opening', target.openingId);
  const wall = floor.walls.find((each) => each.id === opening.wallId);
  if (wall === undefined) throw new ShapeTargetMissingError('wall', opening.wallId);
  const length = homeMapWallLength(wall);
  const start = homeMapProjectOnSegment(wall, grab.from).offset;
  const end = opening.offset + opening.width;
  return (view, ray, modifiers) => {
    const hit = pointOn(view, grab.handle, ray);
    if (hit === null) return null;
    const moved = homeMapProjectOnSegment(wall, hit.point).offset - start;
    const shifted = (value: number): number =>
      clamp(steppedMetres(view, modifiers, value + moved), 0, length);
    const span =
      target.part === 'body'
        ? {
            offset: clamp(shifted(opening.offset), 0, length - opening.width),
            width: opening.width,
          }
        : target.part === 'from'
          ? { offset: shifted(opening.offset), width: end - shifted(opening.offset) }
          : { offset: opening.offset, width: shifted(end) - opening.offset };
    if (span.width <= SHAPE_EPS || span.offset < 0) return null;
    const ends = homeMapOpeningEnds(wall, span.offset, span.width);
    const unchanged =
      Math.abs(span.offset - opening.offset) <= SHAPE_EPS &&
      Math.abs(span.width - opening.width) <= SHAPE_EPS;
    return {
      event: unchanged ? null : { type: 'slide', id: opening.id, ...span },
      preview: {
        kind: 'outline',
        ghosts: [ghost('polyline', [ends.from, ends.to], 'accent')],
        labels: [
          label(ends.from, `${metresText(span.offset)} along the wall`, 'neutral'),
          label(ends.to, metresText(span.width), 'neutral'),
        ],
      },
      snap: null,
    };
  };
}

function scanOf(view: ShapeView): ScanPlacement {
  if (view.scan === null) throw new ShapeTargetMissingError('realistic view', 'scan');
  return view.scan;
}

function pivotOf(view: ShapeView): HomeMapVec {
  const { gizmo } = view.overlay;
  if (gizmo === null) throw new ShapeTargetMissingError('gizmo centre', 'scan');
  return { x: gizmo.centre.x, y: gizmo.centre.y };
}

function liftAt(ray: Ray, through: Vector3, facing: Vector3): number | null {
  const along = ray.direction.dot(facing);
  if (Math.abs(along) <= SHAPE_EPS) return null;
  const distance = through.clone().sub(ray.origin).dot(facing) / along;
  return distance <= 0 ? null : ray.origin.y + ray.direction.y * distance;
}

interface ScanMotion {
  readonly placement: ScanPlacement;
  readonly pivot: HomeMapVec;
  readonly point: HomeMapVec;
  readonly from: HomeMapVec;
}

function scaledAbout(motion: ScanMotion, factor: number, turn: number): ScanPlacement {
  const { placement, pivot } = motion;
  const offset = rotated(minus({ x: placement.tx, y: placement.ty }, pivot), turn);
  return {
    ...placement,
    tx: pivot.x + offset.x * factor,
    ty: pivot.y + offset.y * factor,
    yawDeg: placement.yawDeg + turn,
    scale: placement.scale * factor,
  };
}

function scanTurn(motion: ScanMotion, step: number | null): ScanPlacement | null {
  const { placement, pivot, point, from } = motion;
  if (same(point, pivot) || same(from, pivot)) return null;
  const yaw = placement.yawDeg + angleOf(pivot, point) - angleOf(pivot, from);
  const turn = homeMapSnapRotation(yaw, step) - placement.yawDeg;
  return scaledAbout(motion, 1, turn);
}

function scanScale(motion: ScanMotion): ScanPlacement | null {
  const reach = Math.hypot(motion.from.x - motion.pivot.x, motion.from.y - motion.pivot.y);
  const factor = Math.hypot(motion.point.x - motion.pivot.x, motion.point.y - motion.pivot.y);
  if (reach <= SHAPE_EPS || factor <= SHAPE_EPS) return null;
  return scaledAbout(motion, factor / reach, 0);
}

function scanText(grip: ScanGrip, placement: ScanPlacement): string {
  switch (grip) {
    case 'move':
      return `${metresText(placement.tx)} · ${metresText(placement.ty)}`;
    case 'lift':
      return `${metresText(placement.tz)} up`;
    case 'turn':
      return degreesText(placement.yawDeg);
    case 'scale':
      return `${String(Math.round(placement.scale * PERCENT))}%`;
  }
}

function scanLift(grab: ShapeGrab, placement: ScanPlacement): ShapeStep {
  const { at } = grab.handle;
  const through = new Vector3(at.x, grab.view.edit.floor.elevation + at.height, -at.y);
  const facing = new Vector3(grab.ray.direction.x, 0, grab.ray.direction.z);
  const flat = facing.length() <= SHAPE_EPS;
  const from = flat ? null : liftAt(grab.ray, through, facing.normalize());
  return (view, ray, modifiers) => {
    const now = from === null ? null : liftAt(ray, through, facing);
    if (from === null || now === null) return null;
    const step = gridStep(view, modifiers, HOME_MAP_GRID_FINE_M);
    const next = { ...placement, tz: placement.tz + stepped(now - from, step) };
    return scanFrame(next, 'lift', grab, null);
  };
}

function scanFrame(
  next: ScanPlacement,
  grip: ScanGrip,
  grab: ShapeGrab,
  snap: string | null,
): ShapeFrame {
  const { at } = grab.handle;
  return {
    event: { type: 'scan', placement: next },
    preview: {
      kind: 'scan',
      placement: next,
      ghosts: [],
      labels: [label(at, scanText(grip, next), 'neutral')],
    },
    snap,
  };
}

function cornersOf(placement: ScanPlacement, extent: EditExtent): readonly HomeMapVec[] {
  const local = [
    { x: extent.minX, y: extent.minY },
    { x: extent.maxX, y: extent.minY },
    { x: extent.maxX, y: extent.maxY },
    { x: extent.minX, y: extent.maxY },
  ];
  const at = { x: placement.tx, y: placement.ty };
  return local.map((corner) =>
    plus(
      at,
      rotated({ x: corner.x * placement.scale, y: corner.y * placement.scale }, placement.yawDeg),
    ),
  );
}

interface ScanSnap {
  readonly placement: ScanPlacement;
  readonly snap: string | null;
}

function wallSnapped(view: ShapeView, placement: ScanPlacement, world: Vec3): ScanSnap {
  const extent = view.overlay.scanExtent;
  const radius = radiusAt(view, world, SNAP_RADIUS_PX);
  if (extent === null || radius === null) return { placement, snap: null };
  const settings = {
    radius,
    gridM: null,
    points: true,
    guides: false,
    anchor: null,
    angleStepDeg: null,
  };
  const shifts = cornersOf(placement, extent)
    .map((corner) => ({
      corner,
      snapped: homeMapSnapPoint(corner, view.edit.floor.walls, settings),
    }))
    .filter(({ snapped }) => snapped.kind !== 'free' && snapped.kind !== 'grid')
    .map(({ corner, snapped }) => minus(snapped.point, corner))
    .sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y));
  const shift = shifts[0];
  if (shift === undefined) return { placement, snap: null };
  const tx = placement.tx + shift.x;
  const ty = placement.ty + shift.y;
  return { placement: { ...placement, tx, ty }, snap: `scan:${tx.toFixed(3)},${ty.toFixed(3)}` };
}

function scanMove(grab: ShapeGrab, placement: ScanPlacement): ShapeStep {
  return (view, ray, modifiers) => {
    const hit = pointOn(view, grab.handle, ray);
    if (hit === null) return null;
    const moved = minus(hit.point, grab.from);
    const next = {
      ...placement,
      tx: placement.tx + steppedMetres(view, modifiers, moved.x),
      ty: placement.ty + steppedMetres(view, modifiers, moved.y),
    };
    const snapped = free(view, modifiers)
      ? { placement: next, snap: null }
      : wallSnapped(view, next, hit.world);
    return scanFrame(snapped.placement, 'move', grab, snapped.snap);
  };
}

export function scanStep(grab: ShapeGrab): ShapeStep {
  const grip = SCAN_GRIPS[grab.handle.kind];
  if (grip === undefined) throw new HandleDragUnavailableError(grab.handle.id);
  const placement = scanOf(grab.view);
  if (grip === 'lift') return scanLift(grab, placement);
  if (grip === 'move') return scanMove(grab, placement);
  const pivot = pivotOf(grab.view);
  return (view, ray, modifiers) => {
    const hit = pointOn(view, grab.handle, ray);
    if (hit === null) return null;
    const motion = { placement, pivot, point: hit.point, from: grab.from };
    const next =
      grip === 'turn'
        ? scanTurn(motion, gridStep(view, modifiers, HOME_MAP_ROTATION_STEP_DEG))
        : scanScale(motion);
    return next === null ? null : scanFrame(next, grip, grab, null);
  };
}

type CameraPlacement = HomeMapPlacement & { readonly camera: HomeMapCamera };

function cameraOf(view: ShapeView, deviceId: string): CameraPlacement {
  const placement = view.edit.floor.placements.find((each) => each.deviceId === deviceId);
  const camera = placement?.camera ?? null;
  if (placement === undefined || camera === null) {
    throw new ShapeTargetMissingError('camera placement', deviceId);
  }
  return { ...placement, camera };
}

function pitchAt(placement: CameraPlacement, point: HomeMapVec): number {
  const facing = rotated({ x: 1, y: 0 }, placement.camera.pan.yawDeg);
  const offset = minus(point, placement.at);
  const along = offset.x * facing.x + offset.y * facing.y;
  return Math.atan2(placement.height, along) * DEGREES_PER_RADIAN;
}

function conePose(
  placement: CameraPlacement,
  grab: ShapeGrab,
  point: HomeMapVec,
  step: number | null,
): { readonly yaw: number; readonly pitch: number } | null {
  const yaw = placement.camera.pan.yawDeg;
  const pitch = placement.tilt;
  if (grab.handle.kind === 'cone-pitch') {
    const raw = pitch + pitchAt(placement, point) - pitchAt(placement, grab.from);
    return { yaw, pitch: clamp(stepped(raw, step), -PITCH_LIMIT_DEG, PITCH_LIMIT_DEG) };
  }
  if (same(point, placement.at) || same(grab.from, placement.at)) return null;
  const turned = yaw + angleOf(placement.at, point) - angleOf(placement.at, grab.from);
  return { yaw: homeMapSnapRotation(turned, step), pitch };
}

export function coneStep(grab: ShapeGrab, target: Target<'cone'>): ShapeStep {
  const { kind, id } = grab.handle;
  if (kind !== 'cone-yaw' && kind !== 'cone-pitch') throw new HandleDragUnavailableError(id);
  const placement = cameraOf(grab.view, target.deviceId);
  return (view, ray, modifiers: Modifiers) => {
    const hit = pointOn(view, grab.handle, ray);
    if (hit === null) return null;
    const step = gridStep(view, modifiers, HOME_MAP_ROTATION_STEP_DEG);
    const pose = conePose(placement, grab, hit.point, step);
    if (pose === null) return null;
    const text =
      kind === 'cone-yaw' ? degreesText(pose.yaw) : `tilt ${String(Math.round(pose.pitch))}°`;
    const unchanged =
      Math.abs(homeMapSnapRotation(pose.yaw - placement.camera.pan.yawDeg, null)) <= SHAPE_EPS &&
      Math.abs(pose.pitch - placement.tilt) <= SHAPE_EPS;
    return {
      event: unchanged ? null : { type: 'cone', deviceId: target.deviceId, ...pose },
      preview: {
        kind: 'cone',
        deviceId: target.deviceId,
        ...pose,
        ghosts: [],
        labels: [label(hit.point, text, 'neutral')],
      },
      snap: null,
    };
  };
}
