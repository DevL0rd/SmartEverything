import type { Camera, Ray } from 'three';
import {
  HOME_MAP_GRID_M,
  homeMapEditToLocal,
  homeMapMoveObject,
  type HomeMapEditBox,
  type HomeMapMoveResult,
} from '@smarteverything/domain/home-map-edit-core';
import type { HomeMapVec } from '@smarteverything/domain/home-map-geometry';
import type {
  HomeMapObject,
  HomeMapWall,
  HomeMapWallAttachment,
} from '@smarteverything/domain/home-map-elements';
import type { HomeMapPlacement } from '@smarteverything/domain/home-map-placement';
import { metresText, type Modifiers } from '../../edit/gestures';
import { SNAP_RADIUS_PX } from '../../edit/radii';
import type { EditFloorWire, EditOverlay, EditPathGhost } from '../map-3d-edit-protocol';
import type { Vec3 } from '../mesh';
import type { Point } from '../render-core-gestures';
import { pointerToNdc, type Viewport } from '../render-core-orbit';
import {
  metresForPixels,
  planeAt,
  screenRay,
  surfaceHit,
  type SurfaceContext,
  type WallLine,
} from './ground';
import type { ScreenBounds } from './pointer-scene';

export const WALL_SNAP_TEXT = 'snapped to the wall';
const LABEL_EPS_M = 0.005;
const ZERO: HomeMapVec = { x: 0, y: 0 };

export type MoveMount = HomeMapPlacement['mount'];
export type EditLabel = EditOverlay['labels'][number];
export type Side = HomeMapWallAttachment['side'];

export interface MoveView {
  readonly camera: Camera;
  readonly bounds: ScreenBounds;
  readonly viewport: Viewport;
  readonly edit: EditFloorWire;
  readonly snapping: boolean;
  readonly nameOf: (id: string) => string;
}

export interface MoveItem {
  readonly id: string;
  readonly object: HomeMapObject | null;
  readonly box: HomeMapEditBox;
  readonly tall: number;
  readonly height: number;
  readonly mount: MoveMount;
  readonly wall: HomeMapWallAttachment | null;
}

export interface Placed {
  readonly at: HomeMapVec;
  readonly rotation: number;
  readonly height: number;
  readonly wall: HomeMapWallAttachment | null;
  readonly guides: readonly EditPathGhost[];
  readonly labels: readonly EditLabel[];
  readonly snap: string | null;
}

export interface MoveGrab {
  readonly at: HomeMapVec;
  readonly along: number;
  readonly up: number;
  readonly plane: number;
  readonly wallId: string | null;
}

export interface MoveTrack {
  readonly wallId: string | null;
  readonly height: number;
}

export interface MoveStep {
  readonly ray: Ray;
  readonly grab: MoveGrab;
  readonly track: MoveTrack;
  readonly modifiers: Modifiers;
}

export interface FlatPoint {
  readonly point: HomeMapVec;
  readonly world: Vec3;
  readonly height: number;
  readonly distance: number;
}

export class MoveTargetMissingError extends Error {
  constructor(readonly id: string) {
    super(`No object or device placement ${id} is on the edited floor`);
    this.name = 'MoveTargetMissingError';
  }
}

export class MoveBoxMissingError extends Error {
  constructor(readonly objectId: string) {
    super(`The edited floor carries no box for object ${objectId}`);
    this.name = 'MoveBoxMissingError';
  }
}

export function wallSnapKey(wallId: string): string {
  return `wall:${wallId}`;
}

function objectMount(object: HomeMapObject): MoveMount {
  if (object.wall !== undefined) return 'wall';
  return object.elevation > 0 ? 'table' : 'floor';
}

export function moveItemOf(edit: EditFloorWire, id: string): MoveItem {
  const object = edit.floor.objects.find((each) => each.id === id);
  if (object !== undefined) {
    const size = edit.boxes[object.id];
    if (size === undefined) throw new MoveBoxMissingError(object.id);
    const box = { at: object.at, rotation: object.rotation, w: size.w, d: size.d };
    const wall = object.wall ?? null;
    return {
      id,
      object,
      box,
      tall: size.h,
      height: object.elevation,
      mount: objectMount(object),
      wall,
    };
  }
  const placement = edit.floor.placements.find((each) => each.deviceId === id);
  if (placement === undefined) throw new MoveTargetMissingError(id);
  return {
    id,
    object: null,
    box: { at: placement.at, rotation: placement.rotation, w: 0, d: 0 },
    tall: 0,
    height: placement.height,
    mount: placement.mount,
    wall: placement.wall ?? null,
  };
}

export function surfacesOf(edit: EditFloorWire): SurfaceContext {
  const { floor, boxes } = edit;
  return {
    elevation: floor.elevation,
    ceilingHeight: floor.ceilingHeight,
    wall: (wallId): WallLine | null => {
      const wall = floor.walls.find((each) => each.id === wallId);
      if (wall === undefined) return null;
      return { from: wall.from, to: wall.to, height: wall.height ?? floor.ceilingHeight };
    },
    tableTop: (objectId): number | null => {
      const object = floor.objects.find((each) => each.id === objectId);
      const box = boxes[objectId];
      return object === undefined || box === undefined ? null : object.elevation + box.h;
    },
  };
}

export function rayAt(view: MoveView, at: Point): Ray {
  return screenRay(view.camera, pointerToNdc(at, view.bounds));
}

function planOf(world: Vec3): HomeMapVec {
  return { x: world[0], y: -world[2] };
}

function inside(box: HomeMapEditBox, point: HomeMapVec): boolean {
  const local = homeMapEditToLocal(box, point);
  return Math.abs(local.x) <= box.d / 2 && Math.abs(local.y) <= box.w / 2;
}

function supportUnder(view: MoveView, item: MoveItem, ray: Ray): FlatPoint | null {
  const surfaces = surfacesOf(view.edit);
  let best: FlatPoint | null = null;
  for (const object of view.edit.floor.objects) {
    const size = view.edit.boxes[object.id];
    if (object.id === item.id || size === undefined) continue;
    const hit = surfaceHit(ray, { kind: 'table', objectId: object.id }, surfaces);
    const box = { at: object.at, rotation: object.rotation, w: size.w, d: size.d };
    if (hit?.kind !== 'flat' || !inside(box, hit.at)) continue;
    if (best === null || hit.distance < best.distance) {
      best = { point: hit.at, world: hit.world, height: hit.height, distance: hit.distance };
    }
  }
  return best;
}

export function levelAt(view: MoveView, ray: Ray, plane: number, height: number): FlatPoint | null {
  const hit = planeAt(ray, view.edit.floor.elevation + plane);
  if (hit === null) return null;
  return { point: planOf(hit.world), world: hit.world, height, distance: hit.distance };
}

export function flatPointOf(view: MoveView, item: MoveItem, ray: Ray): FlatPoint | null {
  if (item.mount === 'table') {
    return supportUnder(view, item, ray) ?? levelAt(view, ray, item.height, item.height);
  }
  return levelAt(view, ray, item.mount === 'floor' ? 0 : item.height, item.height);
}

function othersOf(edit: EditFloorWire, id: string): readonly { id: string; box: HomeMapEditBox }[] {
  return edit.floor.objects.flatMap((object) => {
    const size = edit.boxes[object.id];
    if (object.id === id || size === undefined) return [];
    return [
      { id: object.id, box: { at: object.at, rotation: object.rotation, w: size.w, d: size.d } },
    ];
  });
}

export function free(view: MoveView, modifiers: Modifiers): boolean {
  return !view.snapping || modifiers.alt;
}

function line(from: HomeMapVec, to: HomeMapVec, height: number): EditPathGhost {
  return {
    shape: 'polyline',
    points: [
      { x: from.x, y: from.y, height },
      { x: to.x, y: to.y, height },
    ],
    tone: 'snap',
  };
}

function offsetLabels(from: HomeMapVec, at: HomeMapVec, height: number): readonly EditLabel[] {
  const offsets = [at.x - from.x, at.y - from.y].filter((value) => Math.abs(value) > LABEL_EPS_M);
  if (offsets.length === 0) return [];
  const text = offsets.map(metresText).join(' · ');
  return [{ at: { x: at.x, y: at.y, height }, text, tone: 'neutral' }];
}

function flatSnapOf(
  view: MoveView,
  moved: HomeMapMoveResult<HomeMapWall>,
  height: number,
): Pick<Placed, 'guides' | 'labels' | 'snap'> {
  if (moved.wall !== null) {
    const at = { x: moved.at.x, y: moved.at.y, height };
    const labels: readonly EditLabel[] = [{ at, text: WALL_SNAP_TEXT, tone: 'snap' }];
    return {
      guides: [line(moved.wall.from, moved.wall.to, height)],
      labels,
      snap: wallSnapKey(moved.wall.id),
    };
  }
  const first = moved.guides[0];
  if (first === undefined) return { guides: [], labels: [], snap: null };
  const name = view.nameOf(first.targetId).toLowerCase();
  const at = { x: first.to.x, y: first.to.y, height };
  return {
    guides: moved.guides.map((guide) => line(guide.from, guide.to, height)),
    labels: [{ at, text: `snaps to the ${name}`, tone: 'snap' }],
    snap: `object:${moved.guides.map((guide) => `${guide.orientation}:${guide.targetId}`).join('|')}`,
  };
}

export function placeFlat(view: MoveView, item: MoveItem, step: MoveStep): Placed | null {
  const { ray, grab, modifiers } = step;
  const found = flatPointOf(view, item, ray);
  if (found === null) return null;
  const radius = metresForPixels(view.camera, found.world, view.viewport, SNAP_RADIUS_PX);
  if (radius === null) return null;
  const off = free(view, modifiers);
  const desired = { x: found.point.x + grab.at.x, y: found.point.y + grab.at.y };
  const moved = homeMapMoveObject(
    item.box,
    desired,
    { walls: view.edit.floor.walls, others: othersOf(view.edit, item.id) },
    {
      radiusM: off ? 0 : radius,
      gridM: off ? null : HOME_MAP_GRID_M,
      hugWalls: item.mount === 'floor',
    },
  );
  const snapped = flatSnapOf(view, moved, found.height);
  return {
    at: { x: moved.at.x, y: moved.at.y },
    rotation: moved.rotation,
    height: found.height,
    wall: null,
    guides: snapped.guides,
    labels: [...offsetLabels(item.box.at, moved.at, found.height), ...snapped.labels],
    snap: snapped.snap,
  };
}

export function startGrab(item: MoveItem): MoveGrab {
  return { at: ZERO, along: 0, up: 0, plane: item.height, wallId: item.wall?.wallId ?? null };
}

export function flatGrabOf(view: MoveView, item: MoveItem, ray: Ray): MoveGrab {
  const found = flatPointOf(view, item, ray);
  const start = startGrab(item);
  if (found === null) return start;
  return { ...start, at: { x: item.box.at.x - found.point.x, y: item.box.at.y - found.point.y } };
}
