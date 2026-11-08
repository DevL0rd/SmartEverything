import type { Camera, Ray } from 'three';
import {
  HOME_MAP_GRID_FINE_M,
  HOME_MAP_GRID_M,
  homeMapMountOnWall,
  type HomeMapWallMount,
} from '@smarteverything/domain/home-map-edit-core';
import { homeMapWallLength, type HomeMapVec } from '@smarteverything/domain/home-map-geometry';
import type { HomeMapRoom, HomeMapWall } from '@smarteverything/domain/home-map-elements';
import { metresText, type Modifiers } from '../../edit/gestures';
import { HIT_RADIUS_PX } from '../../edit/radii';
import { wallSeat } from '../../edit/wall-seat';
import { metresForPixels, surfaceHit } from './ground';
import {
  free,
  levelAt,
  startGrab,
  surfacesOf,
  wallSnapKey,
  type EditLabel,
  type FlatPoint,
  type MoveGrab,
  type MoveItem,
  type MoveStep,
  type MoveView,
  type Placed,
  type Side,
} from './sessions';

export const WALL_FACE_GRAZE_DEG = 20;
const DEGREES_PER_RADIAN = 180 / Math.PI;

export interface WallSeat {
  readonly wall: HomeMapWall;
  readonly offset: number;
  readonly side: Side;
  readonly height: number;
}

interface WallAnchor {
  readonly u: number;
  readonly v: number;
}

type WallNear = HomeMapWallMount<HomeMapWall, HomeMapRoom>;

function wallOf(view: MoveView, wallId: string | null): HomeMapWall | null {
  return view.edit.floor.walls.find((wall) => wall.id === wallId) ?? null;
}

function grazing(wall: HomeMapWall, ray: Ray): boolean {
  const length = homeMapWallLength(wall);
  const dx = (wall.to.x - wall.from.x) / length;
  const dy = (wall.to.y - wall.from.y) / length;
  const facing = Math.min(1, Math.abs(-dy * ray.direction.x - dx * ray.direction.z));
  return Math.asin(facing) * DEGREES_PER_RADIAN < WALL_FACE_GRAZE_DEG;
}

function faceOf(view: MoveView, wall: HomeMapWall, ray: Ray): WallAnchor | null {
  const length = homeMapWallLength(wall);
  if (length <= 0 || grazing(wall, ray)) return null;
  const hit = surfaceHit(ray, { kind: 'wall', wallId: wall.id }, surfacesOf(view.edit));
  if (hit?.kind !== 'wall' || hit.u <= 0 || hit.u >= length) return null;
  return { u: hit.u, v: hit.v };
}

function sideToward(wall: HomeMapWall, camera: Camera): Side {
  const eye = { x: camera.position.x, y: -camera.position.z };
  const cross =
    (wall.to.x - wall.from.x) * (eye.y - wall.from.y) -
    (wall.to.y - wall.from.y) * (eye.x - wall.from.x);
  return cross > 0 ? 'left' : 'right';
}

function stepped(value: number, step: number | null): number {
  return step === null ? value : Math.round(value / step) * step;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function wallLabels(at: HomeMapVec, offset: number, height: number): readonly EditLabel[] {
  const lifted = { x: at.x, y: at.y, height };
  return [
    { at: lifted, text: `${metresText(offset)} along the wall`, tone: 'neutral' },
    { at: lifted, text: `${metresText(height)} up`, tone: 'neutral' },
  ];
}

export function seatOnWall(
  view: MoveView,
  item: MoveItem,
  seat: WallSeat,
  modifiers: Modifiers,
): Placed | null {
  const off = free(view, modifiers);
  const offset = stepped(seat.offset, off ? null : HOME_MAP_GRID_M);
  const attachment = { wallId: seat.wall.id, offset, side: seat.side };
  const spot = wallSeat(seat.wall, attachment, { width: item.box.w, depth: item.box.d });
  if (spot === null) return null;
  const top = Math.max(0, (seat.wall.height ?? view.edit.floor.ceilingHeight) - item.tall);
  const height = clamp(stepped(seat.height, off ? null : HOME_MAP_GRID_FINE_M), 0, top);
  return {
    at: spot.at,
    rotation: spot.rotation,
    height,
    wall: spot.wall,
    guides: [],
    labels: wallLabels(spot.at, spot.wall.offset, height),
    snap: wallSnapKey(seat.wall.id),
  };
}

function wallNear(view: MoveView, current: HomeMapWall | null, level: FlatPoint): WallNear | null {
  const { walls, rooms } = view.edit.floor;
  const nearest = homeMapMountOnWall(walls, rooms, level.point);
  if (nearest === null || current === null || nearest.wall.id === current.id) return nearest;
  const radius = metresForPixels(view.camera, level.world, view.viewport, HIT_RADIUS_PX);
  if (radius !== null && nearest.distance <= radius) return nearest;
  return homeMapMountOnWall([current], rooms, level.point);
}

function alongOf(grab: MoveGrab, wall: HomeMapWall): number {
  return grab.wallId === wall.id ? grab.along : 0;
}

export function placeWall(view: MoveView, item: MoveItem, step: MoveStep): Placed | null {
  const { ray, grab, track, modifiers } = step;
  const current = wallOf(view, track.wallId);
  const face = current === null ? null : faceOf(view, current, ray);
  if (current !== null && face !== null) {
    const offset = face.u + alongOf(grab, current);
    const side = sideToward(current, view.camera);
    return seatOnWall(
      view,
      item,
      { wall: current, offset, side, height: face.v + grab.up },
      modifiers,
    );
  }
  const level = levelAt(view, ray, grab.plane, track.height);
  const near = level === null ? null : wallNear(view, current, level);
  if (near === null) return null;
  const offset = near.attachment.offset + alongOf(grab, near.wall);
  const seat = { wall: near.wall, offset, side: near.attachment.side, height: track.height };
  return seatOnWall(view, item, seat, modifiers);
}

function wallAnchor(view: MoveView, wall: HomeMapWall, ray: Ray, plane: number): WallAnchor | null {
  const face = faceOf(view, wall, ray);
  if (face !== null) return face;
  const level = levelAt(view, ray, plane, plane);
  const mount =
    level === null ? null : homeMapMountOnWall([wall], view.edit.floor.rooms, level.point);
  return mount === null ? null : { u: mount.attachment.offset, v: plane };
}

export function wallGrabOf(view: MoveView, item: MoveItem, ray: Ray): MoveGrab {
  const start = startGrab(item);
  const wall = wallOf(view, start.wallId);
  if (wall === null || item.wall === null) return start;
  const anchor = wallAnchor(view, wall, ray, item.height);
  if (anchor === null) return start;
  return {
    ...start,
    along: item.wall.offset - anchor.u,
    up: item.height - anchor.v,
    plane: anchor.v,
  };
}
