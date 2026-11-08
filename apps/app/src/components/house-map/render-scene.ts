import type {
  HOME_MAP_MOUNTS,
  HOME_MAP_OPENING_KINDS,
  HOME_MAP_WALL_KINDS,
  HomeMapCamera,
  HomeMapWallAttachment,
} from '@smarteverything/domain';
import {
  homeMapPointInPolygon,
  homeMapPolygonArea,
} from '@smarteverything/domain/home-map-geometry';

export interface RenderPoint {
  readonly x: number;
  readonly y: number;
}

export type RenderRing = readonly RenderPoint[];

export interface RenderPolygon {
  readonly outer: RenderRing;
  readonly holes: readonly RenderRing[];
}

export interface RenderPose extends RenderPoint {
  readonly yawDeg: number;
}

export interface RenderBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export type RenderSceneSource = 'home_map' | 'vacuum';

export type RenderRoomFloor =
  | { readonly status: 'none' }
  | {
      readonly status: 'material';
      readonly kind: string;
      readonly variant: string | null;
      readonly tint: string | null;
    }
  | { readonly status: 'unknown'; readonly code: number; readonly label: string };

export interface RenderRoom {
  readonly id: string;
  readonly name: string | null;
  readonly homeRoomId: string | null;
  readonly polygons: readonly RenderPolygon[];
  readonly labelAt: RenderPoint;
  readonly colourSlot: number;
  readonly floor: RenderRoomFloor;
  readonly wallPaint: string | null;
  readonly ceilingHeight: number;
  readonly areaM2: number;
  readonly hidden: boolean;
}

export interface RenderWall {
  readonly id: string;
  readonly from: RenderPoint;
  readonly to: RenderPoint;
  readonly thickness: number;
  readonly height: number;
  readonly kind: (typeof HOME_MAP_WALL_KINDS)[number];
  readonly exterior: boolean;
}

export interface RenderOpening {
  readonly id: string;
  readonly wallId: string | null;
  readonly from: RenderPoint;
  readonly to: RenderPoint;
  readonly kind: (typeof HOME_MAP_OPENING_KINDS)[number];
  readonly sourceKind: string | null;
  readonly sillHeight: number;
  readonly headHeight: number;
  readonly hinge: 'left' | 'right';
  readonly swing: 'in' | 'out';
  readonly contactDeviceId: string | null;
  readonly lockDeviceId: string | null;
  readonly roomIds: readonly string[];
}

export interface RenderObject {
  readonly id: string;
  readonly modelId: string | null;
  readonly kind: string;
  readonly label: string | null;
  readonly finish: string | null;
  readonly params: Readonly<Record<string, number>>;
  readonly at: RenderPoint;
  readonly rotationDeg: number;
  readonly elevation: number;
  readonly footprint: RenderRing | null;
  readonly height: number | null;
  readonly locked: boolean;
  readonly roomId: string | null;
  readonly wall: HomeMapWallAttachment | null;
}

export interface RenderPlacement {
  readonly deviceId: string;
  readonly name: string | null;
  readonly kind: string | null;
  readonly at: RenderPoint;
  readonly rotationDeg: number;
  readonly height: number;
  readonly tiltDeg: number;
  readonly mount: (typeof HOME_MAP_MOUNTS)[number];
  readonly auto: boolean;
  readonly camera: HomeMapCamera | null;
  readonly roomId: string | null;
  readonly wall: HomeMapWallAttachment | null;
}

export interface RenderCarpet {
  readonly id: string;
  readonly kind: string;
  readonly ring: RenderRing;
}

export interface RenderMarker {
  readonly id: string;
  readonly kind: string;
  readonly at: RenderPoint;
  readonly label: string | null;
}

export interface RenderMeasure {
  readonly id: string;
  readonly from: RenderPoint;
  readonly to: RenderPoint;
  readonly text: string;
}

export interface RenderZone {
  readonly id: string;
  readonly kind: string;
  readonly points: RenderRing;
}

export interface RenderTrailRun {
  readonly mopping: boolean;
  readonly points: RenderRing;
}

export interface RenderVacuum {
  readonly dock: RenderPose | null;
  readonly robot: RenderPose | null;
  readonly trail: readonly RenderTrailRun[];
  readonly zones: readonly RenderZone[];
}

export interface RenderFloor {
  readonly id: string;
  readonly name: string;
  readonly level: number;
  readonly elevation: number;
  readonly ceilingHeight: number;
  readonly bounds: RenderBounds | null;
  readonly rooms: readonly RenderRoom[];
  readonly walls: readonly RenderWall[];
  readonly openings: readonly RenderOpening[];
  readonly objects: readonly RenderObject[];
  readonly placements: readonly RenderPlacement[];
  readonly carpets: readonly RenderCarpet[];
  readonly markers: readonly RenderMarker[];
  readonly measures: readonly RenderMeasure[];
  readonly vacuum: RenderVacuum | null;
}

export interface RenderSceneIssue {
  readonly kind: 'opening_without_wall';
  readonly floorId: string;
  readonly elementId: string;
}

export interface RenderScene {
  readonly key: string;
  readonly source: RenderSceneSource;
  readonly bounds: RenderBounds | null;
  readonly floors: readonly RenderFloor[];
  readonly issues: readonly RenderSceneIssue[];
}

export const RENDER_COLOUR_SLOTS = 8;

const RADIANS_TO_DEGREES = 180 / Math.PI;

export const radiansToDegrees = (radians: number): number => radians * RADIANS_TO_DEGREES;

export const renderColourSlot = (value: number): number =>
  (((Math.trunc(value) % RENDER_COLOUR_SLOTS) + RENDER_COLOUR_SLOTS) % RENDER_COLOUR_SLOTS) + 1;

export function boundsOfPoints(points: Iterable<RenderPoint>): RenderBounds | null {
  let bounds: RenderBounds | null = null;
  for (const point of points) {
    bounds =
      bounds === null
        ? { minX: point.x, minY: point.y, maxX: point.x, maxY: point.y }
        : {
            minX: Math.min(bounds.minX, point.x),
            minY: Math.min(bounds.minY, point.y),
            maxX: Math.max(bounds.maxX, point.x),
            maxY: Math.max(bounds.maxY, point.y),
          };
  }
  return bounds;
}

export function mergeBounds(all: readonly (RenderBounds | null)[]): RenderBounds | null {
  return boundsOfPoints(
    all.flatMap((bounds) =>
      bounds === null
        ? []
        : [
            { x: bounds.minX, y: bounds.minY },
            { x: bounds.maxX, y: bounds.maxY },
          ],
    ),
  );
}

function* floorPoints(floor: Omit<RenderFloor, 'bounds'>): Generator<RenderPoint> {
  for (const room of floor.rooms) for (const polygon of room.polygons) yield* polygon.outer;
  for (const wall of floor.walls) yield* [wall.from, wall.to];
  for (const item of floor.objects) yield* item.footprint ?? [item.at];
  for (const placement of floor.placements) yield placement.at;
  for (const carpet of floor.carpets) yield* carpet.ring;
}

export const floorBounds = (floor: Omit<RenderFloor, 'bounds'>): RenderBounds | null =>
  boundsOfPoints(floorPoints(floor));

export function sceneKeyHash(parts: readonly string[]): string {
  let hash = 0x811c9dc5;
  for (const part of parts) {
    for (let index = 0; index < part.length; index += 1) {
      hash = Math.imul(hash ^ part.charCodeAt(index), 0x01000193);
    }
    hash = Math.imul(hash ^ 0x1f, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function renderRoomAt(rooms: readonly RenderRoom[], at: RenderPoint): string | null {
  let best: string | null = null;
  let bestArea = Infinity;
  for (const room of rooms) {
    for (const polygon of room.polygons) {
      if (!homeMapPointInPolygon(polygon, at)) continue;
      const area = homeMapPolygonArea(polygon);
      if (area < bestArea) {
        best = room.id;
        bestArea = area;
      }
    }
  }
  return best;
}
