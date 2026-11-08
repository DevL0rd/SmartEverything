import type { VacuumPoint, VacuumScene } from '@smarteverything/domain';
import type { ZoneRect } from '../../data/actions';
import { roomHolds } from '../../model/room-at';
import {
  DEFAULT_SIDE_METRES,
  MIN_SIDE_METRES,
  type Draft,
  type FixedShape,
  type RectShape,
  type Shape,
  type ShapeKind,
  type WallShape,
  areaOfRect,
  rectOfPoints,
} from './zone-shapes';

export type Bounds = VacuumScene['bounds'];

export type CornerId = 'nw' | 'ne' | 'se' | 'sw';

export type HandleId = CornerId | 'from' | 'to';

export interface Handle {
  readonly id: HandleId;
  readonly point: VacuumPoint;
}

export type Direction = 'left' | 'right' | 'up' | 'down';

export interface Hit {
  readonly key: number;
  readonly handle: HandleId | null;
}

const WALL_MIN_LENGTH_METRES = 0.2;

function between(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function shiftInside(low: number, high: number, minimum: number, maximum: number): number {
  if (low < minimum) return minimum - low;
  return high > maximum ? maximum - high : 0;
}

export function moveRect(rect: ZoneRect, dx: number, dy: number, bounds: Bounds): ZoneRect {
  const x1 = rect.x1 + dx;
  const x2 = rect.x2 + dx;
  const y1 = rect.y1 + dy;
  const y2 = rect.y2 + dy;
  const shiftX = shiftInside(x1, x2, bounds.minX, bounds.maxX);
  const shiftY = shiftInside(y1, y2, bounds.minY, bounds.maxY);
  return { x1: x1 + shiftX, y1: y1 + shiftY, x2: x2 + shiftX, y2: y2 + shiftY };
}

const CORNER_X: Readonly<Record<CornerId, 'x1' | 'x2'>> = {
  nw: 'x1',
  sw: 'x1',
  ne: 'x2',
  se: 'x2',
};

const CORNER_Y: Readonly<Record<CornerId, 'y1' | 'y2'>> = {
  sw: 'y1',
  se: 'y1',
  nw: 'y2',
  ne: 'y2',
};

export function resizeRect(
  rect: ZoneRect,
  corner: CornerId,
  point: VacuumPoint,
  bounds: Bounds,
): ZoneRect {
  const movesLeft = CORNER_X[corner] === 'x1';
  const movesBottom = CORNER_Y[corner] === 'y1';
  const x = between(point.x, bounds.minX, bounds.maxX);
  const y = between(point.y, bounds.minY, bounds.maxY);
  return {
    x1: movesLeft ? Math.min(x, rect.x2 - MIN_SIDE_METRES) : rect.x1,
    x2: movesLeft ? rect.x2 : Math.max(x, rect.x1 + MIN_SIDE_METRES),
    y1: movesBottom ? Math.min(y, rect.y2 - MIN_SIDE_METRES) : rect.y1,
    y2: movesBottom ? rect.y2 : Math.max(y, rect.y1 + MIN_SIDE_METRES),
  };
}

export function resizeRectTo(
  rect: ZoneRect,
  width: number,
  height: number,
  bounds: Bounds,
): ZoneRect {
  const w = Math.max(MIN_SIDE_METRES, width);
  const h = Math.max(MIN_SIDE_METRES, height);
  return moveRect({ x1: rect.x1, y1: rect.y1, x2: rect.x1 + w, y2: rect.y1 + h }, 0, 0, bounds);
}

function moveWall(wall: WallShape, dx: number, dy: number, bounds: Bounds): WallShape {
  const box = moveRect(rectOfPoints([wall.from, wall.to]), dx, dy, bounds);
  const shiftX = box.x1 - Math.min(wall.from.x, wall.to.x);
  const shiftY = box.y1 - Math.min(wall.from.y, wall.to.y);
  return {
    ...wall,
    from: { x: wall.from.x + shiftX, y: wall.from.y + shiftY },
    to: { x: wall.to.x + shiftX, y: wall.to.y + shiftY },
  };
}

function clampPoint(point: VacuumPoint, bounds: Bounds): VacuumPoint {
  return {
    x: between(point.x, bounds.minX, bounds.maxX),
    y: between(point.y, bounds.minY, bounds.maxY),
  };
}

function moveEnd(
  wall: WallShape,
  end: 'from' | 'to',
  point: VacuumPoint,
  bounds: Bounds,
): WallShape {
  const moved = clampPoint(point, bounds);
  const other = end === 'from' ? wall.to : wall.from;
  const apart = Math.hypot(moved.x - other.x, moved.y - other.y);
  if (apart < WALL_MIN_LENGTH_METRES) return wall;
  return end === 'from' ? { ...wall, from: moved } : { ...wall, to: moved };
}

export function moveShape(shape: Shape, dx: number, dy: number, bounds: Bounds): Shape {
  if (shape.form === 'rect') return { ...shape, rect: moveRect(shape.rect, dx, dy, bounds) };
  if (shape.form === 'wall') return moveWall(shape, dx, dy, bounds);
  return shape;
}

export function dragHandle(
  shape: Shape,
  handle: HandleId,
  point: VacuumPoint,
  bounds: Bounds,
): Shape {
  if (shape.form === 'rect' && handle !== 'from' && handle !== 'to') {
    return { ...shape, rect: resizeRect(shape.rect, handle, point, bounds) };
  }
  if (shape.form === 'wall' && (handle === 'from' || handle === 'to')) {
    return moveEnd(shape, handle, point, bounds);
  }
  return shape;
}

export function nudgeShape(shape: Shape, step: VacuumPoint, bounds: Bounds): Shape {
  return moveShape(shape, step.x, step.y, bounds);
}

export function handlesOf(shape: Shape): readonly Handle[] {
  if (shape.form === 'wall') {
    return [
      { id: 'from', point: shape.from },
      { id: 'to', point: shape.to },
    ];
  }
  if (shape.form === 'fixed') return [];
  const { x1, y1, x2, y2 } = shape.rect;
  return [
    { id: 'nw', point: { x: x1, y: y2 } },
    { id: 'ne', point: { x: x2, y: y2 } },
    { id: 'se', point: { x: x2, y: y1 } },
    { id: 'sw', point: { x: x1, y: y1 } },
  ];
}

export function defaultShape(kind: ShapeKind, key: number, bounds: Bounds): Shape {
  const centre = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
  const half = DEFAULT_SIDE_METRES / 2;
  if (kind === 'wall') {
    const wall: WallShape = {
      form: 'wall',
      key,
      kind,
      from: { x: centre.x - half, y: centre.y },
      to: { x: centre.x + half, y: centre.y },
    };
    return moveWall(wall, 0, 0, bounds);
  }
  const rect = moveRect(
    { x1: centre.x - half, y1: centre.y - half, x2: centre.x + half, y2: centre.y + half },
    0,
    0,
    bounds,
  );
  return { form: 'rect', key, kind, rect };
}

export function sizeOf(shape: Shape): { readonly width: number; readonly height: number } {
  if (shape.form === 'wall') {
    return { width: Math.hypot(shape.to.x - shape.from.x, shape.to.y - shape.from.y), height: 0 };
  }
  const rect = shape.form === 'rect' ? shape.rect : rectOfPoints(shape.points);
  return { width: rect.x2 - rect.x1, height: rect.y2 - rect.y1 };
}

function metres(value: number): string {
  return value.toFixed(1);
}

export function sizeText(shape: Shape): string {
  const { width, height } = sizeOf(shape);
  return shape.form === 'wall'
    ? `${metres(width)} m long`
    : `${metres(width)} by ${metres(height)} m`;
}

function distanceToSegment(point: VacuumPoint, from: VacuumPoint, to: VacuumPoint): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  const along =
    lengthSquared === 0
      ? 0
      : between(((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared, 0, 1);
  return Math.hypot(point.x - (from.x + along * dx), point.y - (from.y + along * dy));
}

function insideRect(shape: RectShape, point: VacuumPoint, margin: number): boolean {
  const { x1, y1, x2, y2 } = shape.rect;
  return (
    point.x >= x1 - margin &&
    point.x <= x2 + margin &&
    point.y >= y1 - margin &&
    point.y <= y2 + margin
  );
}

function insideFixed(shape: FixedShape, point: VacuumPoint): boolean {
  return roomHolds({ rings: [[...shape.points]] }, point);
}

function holds(shape: Shape, point: VacuumPoint, margin: number): boolean {
  if (shape.form === 'rect') return insideRect(shape, point, margin);
  if (shape.form === 'fixed') return insideFixed(shape, point);
  return distanceToSegment(point, shape.from, shape.to) <= margin;
}

export function hitShape(
  draft: Draft,
  selectedKey: number | null,
  point: VacuumPoint,
  margin: number,
): Hit | null {
  const selected = draft.find((shape) => shape.key === selectedKey);
  const handle = selected === undefined ? undefined : handleAt(selected, point, margin);
  if (selected !== undefined && handle !== undefined) return { key: selected.key, handle };
  const found = [...draft].reverse().find((shape) => holds(shape, point, margin));
  return found === undefined ? null : { key: found.key, handle: null };
}

function handleAt(shape: Shape, point: VacuumPoint, margin: number): HandleId | undefined {
  return handlesOf(shape).find(
    (handle) => Math.hypot(handle.point.x - point.x, handle.point.y - point.y) <= margin,
  )?.id;
}

export function shapePoints(shape: Shape): readonly VacuumPoint[] {
  if (shape.form === 'wall') return [shape.from, shape.to];
  return shape.form === 'fixed' ? shape.points : areaOfRect(shape.rect);
}
