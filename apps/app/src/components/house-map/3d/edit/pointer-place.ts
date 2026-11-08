import type { Camera, Ray } from 'three';
import {
  homeMapEditToLocal,
  homeMapMountOnWall,
  homeMapWallPose,
} from '@smarteverything/domain/home-map-edit-core';
import { homeMapWallLength, type HomeMapVec } from '@smarteverything/domain/home-map-geometry';
import type { HomeMapWall, HomeMapWallAttachment } from '@smarteverything/domain/home-map-elements';
import { HIT_RADIUS_PX } from '../../edit/radii';
import type { EditFloorWire, EditPlace } from '../map-3d-edit-protocol';
import type { Vec3 } from '../mesh';
import type { Point } from '../render-core-gestures';
import { pointerToNdc, type Viewport } from '../render-core-orbit';
import { metresForPixels, planeAt, screenRay, surfaceHit, type SurfaceContext } from './ground';
import type { PlaceSpot } from './pointer';
import type { ScreenBounds } from './pointer-scene';
import { surfacesOf } from './sessions';

export interface PlaceView {
  readonly camera: Camera;
  readonly bounds: ScreenBounds;
  readonly viewport: Viewport;
  readonly edit: EditFloorWire;
}

type DevicePlace = Extract<EditPlace, { readonly kind: 'device' }>;

type Box = EditFloorWire['boxes'][string];

interface Ground {
  readonly at: HomeMapVec;
  readonly world: Vec3;
}

function groundOf(view: PlaceView, ray: Ray): Ground | null {
  const hit = planeAt(ray, view.edit.floor.elevation);
  return hit === null ? null : { at: { x: hit.world[0], y: -hit.world[2] }, world: hit.world };
}

function flatSpot(at: HomeMapVec, height: number, surface: PlaceSpot['surface']): PlaceSpot {
  return { at: { x: at.x, y: at.y }, height, rotation: 0, surface, wall: null };
}

interface Found<T> {
  readonly value: T;
  readonly distance: number;
}

function nearest<T>(found: readonly (Found<T> | null)[]): T | null {
  let best: Found<T> | null = null;
  for (const each of found)
    if (each !== null && (best === null || each.distance < best.distance)) best = each;
  return best?.value ?? null;
}

type FloorObject = EditFloorWire['floor']['objects'][number];

function tableHit(
  ray: Ray,
  surfaces: SurfaceContext,
  object: FloorObject,
  size: Box,
): Found<PlaceSpot> | null {
  const surface = { kind: 'table', objectId: object.id } as const;
  const hit = surfaceHit(ray, surface, surfaces);
  if (hit?.kind !== 'flat') return null;
  const local = homeMapEditToLocal({ at: object.at, rotation: object.rotation, ...size }, hit.at);
  if (Math.abs(local.x) > size.d / 2 || Math.abs(local.y) > size.w / 2) return null;
  return { value: flatSpot(hit.at, hit.height, surface), distance: hit.distance };
}

function tableSpot(view: PlaceView, ray: Ray, surfaces: SurfaceContext): PlaceSpot | null {
  const { objects } = view.edit.floor;
  return nearest(
    objects.map((object) => {
      const size = view.edit.boxes[object.id];
      return size === undefined ? null : tableHit(ray, surfaces, object, size);
    }),
  );
}

interface WallLineShape {
  readonly from: HomeMapVec;
  readonly to: HomeMapVec;
}

export function sideToward(wall: WallLineShape, camera: Camera): HomeMapWallAttachment['side'] {
  const eye = { x: camera.position.x, y: -camera.position.z };
  const cross =
    (wall.to.x - wall.from.x) * (eye.y - wall.from.y) -
    (wall.to.y - wall.from.y) * (eye.x - wall.from.x);
  return cross > 0 ? 'left' : 'right';
}

function faceHit(
  view: PlaceView,
  ray: Ray,
  wall: HomeMapWall,
): Found<HomeMapWallAttachment> | null {
  const hit = surfaceHit(ray, { kind: 'wall', wallId: wall.id }, surfacesOf(view.edit));
  if (hit?.kind !== 'wall' || hit.u <= 0 || hit.u >= homeMapWallLength(wall)) return null;
  const top = wall.height ?? view.edit.floor.ceilingHeight;
  if (hit.v <= 0 || hit.v >= top) return null;
  const value = { wallId: wall.id, offset: hit.u, side: sideToward(wall, view.camera) };
  return { value, distance: hit.distance };
}

function faceAttachment(view: PlaceView, ray: Ray): HomeMapWallAttachment | null {
  return nearest(view.edit.floor.walls.map((wall) => faceHit(view, ray, wall)));
}

function nearAttachment(view: PlaceView, ground: Ground | null): HomeMapWallAttachment | null {
  if (ground === null) return null;
  const { walls, rooms } = view.edit.floor;
  const near = homeMapMountOnWall(walls, rooms, ground.at);
  const radius = metresForPixels(view.camera, ground.world, view.viewport, HIT_RADIUS_PX);
  if (near === null || radius === null || near.distance > radius) return null;
  return near.attachment;
}

function wallSpot(view: PlaceView, ray: Ray, place: DevicePlace): PlaceSpot | null {
  const attachment = faceAttachment(view, ray) ?? nearAttachment(view, groundOf(view, ray));
  const wall = view.edit.floor.walls.find((each) => each.id === attachment?.wallId);
  if (attachment === null || wall === undefined) return null;
  const pose = homeMapWallPose(wall, attachment);
  if (pose === null) return null;
  const top = wall.height ?? view.edit.floor.ceilingHeight;
  return {
    at: pose.at,
    height: Math.min(place.height, top),
    rotation: pose.rotation,
    surface: { kind: 'wall', wallId: wall.id },
    wall: attachment,
  };
}

function deviceSpot(view: PlaceView, ray: Ray, place: DevicePlace): PlaceSpot | null {
  const ground = groundOf(view, ray);
  switch (place.mount) {
    case 'wall':
      return wallSpot(view, ray, place);
    case 'ceiling':
      return ground === null
        ? null
        : flatSpot(ground.at, view.edit.floor.ceilingHeight, { kind: 'ceiling' });
    case 'table':
      return (
        tableSpot(view, ray, surfacesOf(view.edit)) ??
        (ground === null ? null : flatSpot(ground.at, 0, { kind: 'ground' }))
      );
    case 'floor':
      return ground === null ? null : flatSpot(ground.at, 0, { kind: 'ground' });
  }
}

export function placeSpotAt(view: PlaceView, place: EditPlace, at: Point): PlaceSpot | null {
  const ray = screenRay(view.camera, pointerToNdc(at, view.bounds));
  if (place.kind === 'device') return deviceSpot(view, ray, place);
  const ground = groundOf(view, ray);
  if (ground === null) return null;
  return { ...flatSpot(ground.at, 0, { kind: 'ground' }), rotation: place.rotation };
}
