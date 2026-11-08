import { homeMapBoxCorners } from '@smarteverything/domain/home-map-edit-core';
import type { HomeMapWallAttachment } from '@smarteverything/domain/home-map-elements';
import type { EditFloorWire, EditGhost } from '../map-3d-edit-protocol';
import type { Point } from '../render-core-gestures';
import { metresText } from '../../edit/gestures';
import { GIZMO_SIZES, toScreen, type GizmoView } from './gizmo';
import {
  LIVE_PILL_GAP_PX,
  PILL_HEIGHT_PX,
  pathOf,
  type DrawnPath,
  type DrawnPill,
  type OverlayTone,
} from './overlay-model';
import type { DragGrab, PlaceSpot, PointerHover } from './pointer';
import type { MovePose, MoveSize } from './sessions-factory';

export interface Drawn {
  readonly paths: readonly DrawnPath[];
  readonly pills: readonly DrawnPill[];
}

export const NOTHING: Drawn = { paths: [], pills: [] };

const RING_STEPS = 32;

export interface HeightPoint {
  readonly x: number;
  readonly y: number;
  readonly height: number;
}

export function wallFaceOf(
  edit: EditFloorWire,
  wallId: string,
  side: HomeMapWallAttachment['side'],
): readonly HeightPoint[] | null {
  const wall = edit.floor.walls.find((each) => each.id === wallId);
  if (wall === undefined) return null;
  const dx = wall.to.x - wall.from.x;
  const dy = wall.to.y - wall.from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return null;
  const reach = ((side === 'left' ? 1 : -1) * wall.thickness) / 2 / length;
  const off = { x: -dy * reach, y: dx * reach };
  const top = wall.height ?? edit.floor.ceilingHeight;
  const from = { x: wall.from.x + off.x, y: wall.from.y + off.y };
  const to = { x: wall.to.x + off.x, y: wall.to.y + off.y };
  return [
    { ...from, height: 0 },
    { ...to, height: 0 },
    { ...to, height: top },
    { ...from, height: top },
  ];
}

const HALF_TURN_DEG = 180;

const FULL_TURN_DEG = 360;

const MINUS = '\u2212';

function signedTurn(degrees: number): string {
  const wrapped =
    ((((degrees + HALF_TURN_DEG) % FULL_TURN_DEG) + FULL_TURN_DEG) % FULL_TURN_DEG) - HALF_TURN_DEG;
  const whole = Math.round(wrapped);
  return whole < 0 ? `${MINUS}${String(-whole)}°` : `${String(whole)}°`;
}

function startTurnOf(edit: EditFloorWire, id: string): number | null {
  const object = edit.floor.objects.find((each) => each.id === id);
  if (object !== undefined) return object.rotation;
  return edit.floor.placements.find((each) => each.deviceId === id)?.rotation ?? null;
}

export function twistText(
  edit: EditFloorWire,
  pose: MovePose,
  size: MoveSize | null,
): string | null {
  const start = startTurnOf(edit, pose.id);
  if (start === null) return null;
  const turn = `Turn ${signedTurn(pose.rotation - start)}`;
  const box = size ?? edit.boxes[pose.id] ?? null;
  return box === null ? turn : `${turn}  ${box.w.toFixed(2)} × ${box.d.toFixed(2)} m`;
}

export function screenAt(view: GizmoView, at: HeightPoint): Point | null {
  const elevation = view.edit.floor.elevation;
  const point = toScreen(view, [at.x, elevation + at.height, -at.y]);
  return point === null ? null : { x: point.x - view.bounds.left, y: point.y - view.bounds.top };
}

export function screenAll(view: GizmoView, points: readonly HeightPoint[]): readonly Point[] {
  return points.flatMap((point) => {
    const at = screenAt(view, point);
    return at === null ? [] : [at];
  });
}

export function areaPath(
  key: string,
  points: readonly Point[],
  look: DrawnPath['look'],
  tone: OverlayTone,
): DrawnPath {
  return { key, d: pathOf(points, true), look, tone, state: 'rest' };
}

export function facePaths(
  view: GizmoView,
  ghost: Extract<EditGhost, { shape: 'wall-face' }>,
  key: string,
): DrawnPath[] {
  const sides = ghost.face === 'both' ? (['left', 'right'] as const) : [ghost.face];
  return sides.flatMap((side) => {
    const face = wallFaceOf(view.edit, ghost.wallId, side);
    return face === null
      ? []
      : [areaPath(`${key}:${side}`, screenAll(view, face), 'face', ghost.tone)];
  });
}

function ringAround(centre: Point, radius: number): readonly Point[] {
  return Array.from({ length: RING_STEPS }, (_, index) => {
    const turn = (index / RING_STEPS) * Math.PI * 2;
    return { x: centre.x + Math.cos(turn) * radius, y: centre.y + Math.sin(turn) * radius };
  });
}

function landingOf(view: GizmoView, spot: PlaceSpot): Drawn {
  const centre = screenAt(view, { ...spot.at, height: spot.height });
  if (centre === null) return NOTHING;
  const radius = GIZMO_SIZES[view.breakpoint].targetPx / 2;
  const ring = areaPath('place:ring', ringAround(centre, radius), 'landing', 'accent');
  const wall = spot.wall;
  const face = wall === null ? null : wallFaceOf(view.edit, wall.wallId, wall.side);
  const glow =
    face === null ? [] : [areaPath('place:wall', screenAll(view, face), 'face', 'accent')];
  const y = centre.y - radius - LIVE_PILL_GAP_PX - PILL_HEIGHT_PX / 2;
  const text = `${metresText(spot.height)} above floor`;
  const pills: DrawnPill[] =
    spot.height > 0
      ? [{ key: 'place:height', x: centre.x, y, text, look: 'live', tone: 'neutral' }]
      : [];
  return { paths: [...glow, ring], pills };
}

function placeOf(view: GizmoView, spot: PlaceSpot): Drawn {
  const { place } = view.overlay;
  if (place === null) return NOTHING;
  if (place.kind === 'device') return landingOf(view, spot);
  const corners = homeMapBoxCorners({ at: spot.at, rotation: spot.rotation, ...place.footprint });
  const points = screenAll(
    view,
    corners.map((corner) => ({ ...corner, height: spot.height })),
  );
  return { paths: [areaPath('place:ghost', points, 'place', 'accent')], pills: [] };
}

function paintOf(view: GizmoView, hover: Extract<PointerHover, { kind: 'paint' }>): Drawn {
  const { target } = hover;
  if (target.kind === 'wall') {
    const face = wallFaceOf(view.edit, target.wallId, target.side);
    return face === null
      ? NOTHING
      : { paths: [areaPath('paint', screenAll(view, face), 'tint', 'accent')], pills: [] };
  }
  const room = view.edit.floor.rooms.find((each) => each.id === target.roomId);
  if (room === undefined) return NOTHING;
  const points = screenAll(
    view,
    room.polygon.outer.map((point) => ({ ...point, height: 0 })),
  );
  return { paths: [areaPath('paint', points, 'tint', 'accent')], pills: [] };
}

export function hoverDrawn(
  view: GizmoView,
  hover: PointerHover | null,
  grab: DragGrab | null,
): Drawn {
  if (hover === null || grab !== null || view.overlay.readOnly) return NOTHING;
  if (hover.kind === 'paint' && view.overlay.mode === 'paint') return paintOf(view, hover);
  if (hover.kind === 'place' && view.overlay.mode === 'place') return placeOf(view, hover.spot);
  return NOTHING;
}

type Floor = EditFloorWire['floor'];

function wallHolding(floor: Floor, id: string): string | null {
  if (floor.walls.some((wall) => wall.id === id)) return id;
  const opening = floor.openings.find((each) => each.id === id);
  if (opening !== undefined) return opening.wallId;
  const object = floor.objects.find((each) => each.id === id);
  if (object !== undefined) return object.wall?.wallId ?? null;
  return floor.placements.find((each) => each.deviceId === id)?.wall?.wallId ?? null;
}

export function fullWallsOf(edit: EditFloorWire, ids: readonly string[]): ReadonlySet<string> {
  return new Set(
    ids.flatMap((id) => {
      const wallId = wallHolding(edit.floor, id);
      return wallId === null ? [] : [wallId];
    }),
  );
}

function stood(
  points: readonly { x: number; y: number }[],
  low: number,
  high: number,
): HeightPoint[] {
  return points.flatMap((point) => [
    { x: point.x, y: point.y, height: low },
    { x: point.x, y: point.y, height: high },
  ]);
}

function openingPoints(floor: Floor, id: string): readonly HeightPoint[] | null {
  const opening = floor.openings.find((each) => each.id === id);
  const wall = floor.walls.find((each) => each.id === opening?.wallId);
  if (opening === undefined || wall === undefined) return null;
  const length = Math.hypot(wall.to.x - wall.from.x, wall.to.y - wall.from.y);
  if (length === 0) return null;
  const at = (metres: number): { x: number; y: number } => ({
    x: wall.from.x + ((wall.to.x - wall.from.x) * metres) / length,
    y: wall.from.y + ((wall.to.y - wall.from.y) * metres) / length,
  });
  const ends = [at(opening.offset), at(opening.offset + opening.width)];
  return stood(ends, opening.sillHeight, opening.headHeight);
}

function itemPoints(edit: EditFloorWire, id: string): readonly HeightPoint[] | null {
  const { floor } = edit;
  const object = floor.objects.find((each) => each.id === id);
  const size = edit.boxes[id];
  if (object !== undefined && size !== undefined) {
    const corners = homeMapBoxCorners({ at: object.at, rotation: object.rotation, ...size });
    return stood(corners, object.elevation, object.elevation + size.h);
  }
  const placement = floor.placements.find((each) => each.deviceId === id);
  return placement === undefined ? null : [{ ...placement.at, height: placement.height }];
}

function structurePoints(floor: Floor, id: string): readonly HeightPoint[] | null {
  const room = floor.rooms.find((each) => each.id === id);
  if (room !== undefined) return room.polygon.outer.map((point) => ({ ...point, height: 0 }));
  const wall = floor.walls.find((each) => each.id === id);
  if (wall === undefined) return openingPoints(floor, id);
  return stood([wall.from, wall.to], 0, wall.height ?? floor.ceilingHeight);
}

export function selectionPoints(
  edit: EditFloorWire,
  ids: readonly string[],
): readonly HeightPoint[] {
  return ids.flatMap((id) => itemPoints(edit, id) ?? structurePoints(edit.floor, id) ?? []);
}
