import {
  VACUUM_RESTRICTED_LIMIT,
  type VacuumPoint,
  type VacuumRestricted,
  type VacuumScene,
} from '@smarteverything/domain';
import type { ZoneRect } from '../../data/actions';

export const MAX_CLEAN_ZONES = 5;

export const MAX_RESTRICTED = VACUUM_RESTRICTED_LIMIT;

export const MIN_SIDE_METRES = 0.2;

export const NUDGE_METRES = 0.1;

export const DEFAULT_SIDE_METRES = 1;

const ALIGNED_EPSILON = 1e-3;

const SIGNATURE_DIGITS = 3;

export type ShapeKind = 'clean' | 'no_go' | 'no_mop' | 'wall';

export type AreaKind = 'no_go' | 'no_mop';

export interface RectShape {
  readonly form: 'rect';
  readonly key: number;
  readonly kind: 'clean' | AreaKind;
  readonly rect: ZoneRect;
}

export interface FixedShape {
  readonly form: 'fixed';
  readonly key: number;
  readonly kind: AreaKind;
  readonly points: readonly VacuumPoint[];
}

export interface WallShape {
  readonly form: 'wall';
  readonly key: number;
  readonly kind: 'wall';
  readonly from: VacuumPoint;
  readonly to: VacuumPoint;
}

export type Shape = RectShape | FixedShape | WallShape;

export type Draft = readonly Shape[];

export const KIND_LABEL: Readonly<Record<ShapeKind, string>> = {
  clean: 'Clean zone',
  no_go: 'No-go area',
  no_mop: 'No-mop area',
  wall: 'Virtual wall',
};

export function rectOfPoints(points: readonly VacuumPoint[]): ZoneRect {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    x1: Math.min(...xs),
    y1: Math.min(...ys),
    x2: Math.max(...xs),
    y2: Math.max(...ys),
  };
}

export function areaOfRect(rect: ZoneRect): readonly VacuumPoint[] {
  return [
    { x: rect.x1, y: rect.y1 },
    { x: rect.x2, y: rect.y1 },
    { x: rect.x2, y: rect.y2 },
    { x: rect.x1, y: rect.y2 },
  ];
}

function axisAligned(points: readonly VacuumPoint[]): boolean {
  const rect = rectOfPoints(points);
  return points.every(
    (point) =>
      (Math.abs(point.x - rect.x1) < ALIGNED_EPSILON ||
        Math.abs(point.x - rect.x2) < ALIGNED_EPSILON) &&
      (Math.abs(point.y - rect.y1) < ALIGNED_EPSILON ||
        Math.abs(point.y - rect.y2) < ALIGNED_EPSILON),
  );
}

function areaShape(key: number, kind: AreaKind, points: readonly VacuumPoint[]): Shape {
  if (points.length === 4 && !axisAligned(points)) {
    return { form: 'fixed', key, kind, points };
  }
  return { form: 'rect', key, kind, rect: rectOfPoints(points) };
}

function wallShape(key: number, points: readonly VacuumPoint[]): Shape | null {
  const from = points[0];
  const to = points[points.length - 1];
  return from === undefined || to === undefined || points.length < 2
    ? null
    : { form: 'wall', key, kind: 'wall', from, to };
}

interface RestrictedLists {
  readonly noGo: readonly (readonly VacuumPoint[])[];
  readonly noMop: readonly (readonly VacuumPoint[])[];
  readonly walls: readonly (readonly VacuumPoint[])[];
}

function shapesOfLists(lists: RestrictedLists, firstKey: number): Draft {
  const shapes: Shape[] = [];
  const add = (shape: Shape | null): void => {
    if (shape !== null) shapes.push(shape);
  };
  lists.noGo.forEach((points) => {
    add(areaShape(firstKey + shapes.length, 'no_go', points));
  });
  lists.noMop.forEach((points) => {
    add(areaShape(firstKey + shapes.length, 'no_mop', points));
  });
  lists.walls.forEach((points) => {
    add(wallShape(firstKey + shapes.length, points));
  });
  return shapes;
}

export function restrictedShapesOfScene(zones: VacuumScene['zones'], firstKey = 1): Draft {
  const pointsOf = (kind: string): readonly (readonly VacuumPoint[])[] =>
    zones.filter((zone) => zone.kind === kind).map((zone) => zone.points);
  return shapesOfLists(
    { noGo: pointsOf('no_go'), noMop: pointsOf('no_mop'), walls: pointsOf('wall') },
    firstKey,
  );
}

export function restrictedShapesOf(restricted: VacuumRestricted, firstKey = 1): Draft {
  return shapesOfLists(
    {
      noGo: restricted.noGo,
      noMop: restricted.noMop,
      walls: restricted.walls.map((wall) => [wall.from, wall.to]),
    },
    firstKey,
  );
}

export function isRestricted(shape: Shape): boolean {
  return shape.kind !== 'clean';
}

export function cleanShapes(draft: Draft): readonly RectShape[] {
  return draft.flatMap((shape) => (shape.form === 'rect' && shape.kind === 'clean' ? shape : []));
}

export function cleanZonesOf(draft: Draft): readonly ZoneRect[] {
  return cleanShapes(draft).map((shape) => shape.rect);
}

function rectOf(shape: Shape): ZoneRect {
  return shape.form === 'rect'
    ? shape.rect
    : rectOfPoints(shape.form === 'fixed' ? shape.points : [shape.from, shape.to]);
}

export function restrictedOf(draft: Draft): VacuumRestricted {
  const areasOf = (kind: AreaKind): readonly (readonly VacuumPoint[])[] =>
    draft.flatMap((shape) => {
      if (shape.kind !== kind) return [];
      return shape.form === 'fixed' ? [shape.points] : [areaOfRect(rectOf(shape))];
    });
  return {
    noGo: areasOf('no_go').map((area) => [...area]),
    noMop: areasOf('no_mop').map((area) => [...area]),
    walls: draft.flatMap((shape) =>
      shape.form === 'wall' ? [{ from: shape.from, to: shape.to }] : [],
    ),
  };
}

export interface Counts {
  readonly clean: number;
  readonly restricted: number;
}

export function countsOf(draft: Draft): Counts {
  const restricted = draft.filter(isRestricted).length;
  return { clean: draft.length - restricted, restricted };
}

export function limitReason(draft: Draft, kind: ShapeKind): string | null {
  const counts = countsOf(draft);
  if (kind === 'clean') {
    return counts.clean >= MAX_CLEAN_ZONES
      ? `Up to ${String(MAX_CLEAN_ZONES)} zones per clean.`
      : null;
  }
  return counts.restricted >= MAX_RESTRICTED
    ? `Up to ${String(MAX_RESTRICTED)} no-go areas and walls in total.`
    : null;
}

export function nextKey(draft: Draft): number {
  return draft.reduce((highest, shape) => Math.max(highest, shape.key), 0) + 1;
}

function round(value: number): number {
  return Number(value.toFixed(SIGNATURE_DIGITS));
}

export function signatureOf(draft: Draft): string {
  const restricted = restrictedOf(draft);
  const pointText = (point: VacuumPoint): string =>
    `${String(round(point.x))},${String(round(point.y))}`;
  return JSON.stringify([
    restricted.noGo.map((area) => area.map(pointText)),
    restricted.noMop.map((area) => area.map(pointText)),
    restricted.walls.map((wall) => [pointText(wall.from), pointText(wall.to)]),
  ]);
}
