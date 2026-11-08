import {
  HOME_MAP_NOTICE_WRITE,
  HOME_MAP_POINT,
  type HomeMapNotice,
  type HomeMapOp,
  type HomeMapPolygonShape,
  type HomeMapRingShape,
  type HomeMapSource,
  type HomeMapSourceGeometry,
  type HomeMapVec,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { FrameCheck, FrameCheckInput } from './pipeline';
import { rectifyPoint, type RectifyTransform } from './rectify';

export const FRAME_MOVED_M = 0.3;
export const FRAME_RESIDUAL_M = 0.15;

export const FRAME_REALIGNED_TEXT = "The robot's map moved, the map was realigned: check it.";
export const FRAME_REFUSED_TEXT =
  "The robot's map moved and could not be matched to the house. Align it with two points.";

const MIN_PAIRS = 2;
const SPREAD_EPS = 1e-12;

export interface AlignPair {
  readonly robot: HomeMapVec;
  readonly house: HomeMapVec;
}

export interface RigidFit {
  readonly transform: RectifyTransform;
  readonly rmsM: number;
}

const BASE_DOCK = z.looseObject({ at: HOME_MAP_POINT });

const toDeg = (rad: number): number => (rad * 180) / Math.PI;

const flip = (mirrored: boolean, point: HomeMapVec): HomeMapVec =>
  mirrored ? { x: -point.x, y: point.y } : point;

const meanOf = (points: readonly HomeMapVec[]): HomeMapVec => ({
  x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
  y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
});

interface RingMoment {
  readonly weight: number;
  readonly centre: HomeMapVec;
}

function ringMoment(ring: HomeMapRingShape): RingMoment | null {
  let twice = 0;
  let sumX = 0;
  let sumY = 0;
  ring.forEach((a, index) => {
    const b = ring[(index + 1) % ring.length] ?? a;
    const cross = a.x * b.y - b.x * a.y;
    twice += cross;
    sumX += (a.x + b.x) * cross;
    sumY += (a.y + b.y) * cross;
  });
  return twice === 0
    ? null
    : { weight: Math.abs(twice) / 2, centre: { x: sumX / (3 * twice), y: sumY / (3 * twice) } };
}

export function polygonCentroid(polygon: HomeMapPolygonShape): HomeMapVec | null {
  const outer = ringMoment(polygon.outer);
  if (outer === null) return null;
  const holes = polygon.holes.flatMap((hole) => ringMoment(hole) ?? []);
  const weight = outer.weight - holes.reduce((sum, h) => sum + h.weight, 0);
  if (weight <= 0) return null;
  return {
    x:
      (outer.weight * outer.centre.x - holes.reduce((s, h) => s + h.weight * h.centre.x, 0)) /
      weight,
    y:
      (outer.weight * outer.centre.y - holes.reduce((s, h) => s + h.weight * h.centre.y, 0)) /
      weight,
  };
}

export function fitRigidTransform(pairs: readonly AlignPair[], mirrored: boolean): RigidFit | null {
  if (pairs.length < MIN_PAIRS) return null;
  const robots = pairs.map((pair) => flip(mirrored, pair.robot));
  const robotMean = meanOf(robots);
  const houseMean = meanOf(pairs.map((pair) => pair.house));
  let dot = 0;
  let cross = 0;
  let spread = 0;
  pairs.forEach((pair, index) => {
    const a = robots[index] ?? robotMean;
    const ax = a.x - robotMean.x;
    const ay = a.y - robotMean.y;
    const bx = pair.house.x - houseMean.x;
    const by = pair.house.y - houseMean.y;
    dot += ax * bx + ay * by;
    cross += ax * by - ay * bx;
    spread += ax * ax + ay * ay;
  });
  if (spread <= SPREAD_EPS) return null;
  const turn = Math.atan2(cross, dot);
  const transform: RectifyTransform = {
    rotationDeg: toDeg(turn),
    mirrored,
    tx: houseMean.x - (Math.cos(turn) * robotMean.x - Math.sin(turn) * robotMean.y),
    ty: houseMean.y - (Math.sin(turn) * robotMean.x + Math.cos(turn) * robotMean.y),
  };
  const squared = pairs.map((pair) => {
    const at = rectifyPoint(transform, pair.robot);
    return (at.x - pair.house.x) ** 2 + (at.y - pair.house.y) ** 2;
  });
  return { transform, rmsM: Math.sqrt(squared.reduce((a, b) => a + b, 0) / pairs.length) };
}

export const twoPointAlign = (
  points: readonly [AlignPair, AlignPair],
  mirrored: boolean,
): RigidFit | null => fitRigidTransform(points, mirrored);

function roomPairs(source: HomeMapSource, geometry: HomeMapSourceGeometry): readonly AlignPair[] {
  const held = new Map(source.base.rooms.map((room) => [room.ref, room.polygon]));
  return geometry.rooms.flatMap((room): AlignPair[] => {
    const polygon = held.get(room.ref);
    const robot = polygonCentroid({ outer: room.ring, holes: room.holes });
    const house = polygon === undefined ? null : polygonCentroid(polygon);
    return robot === null || house === null ? [] : [{ robot, house }];
  });
}

function dockPair(source: HomeMapSource, geometry: HomeMapSourceGeometry): readonly AlignPair[] {
  const held = BASE_DOCK.safeParse(source.base['dock']);
  const dock = geometry.dock;
  return held.success && dock !== null
    ? [{ robot: { x: dock.x, y: dock.y }, house: { x: held.data.at.x, y: held.data.at.y } }]
    : [];
}

export const framePairs = (
  source: HomeMapSource,
  geometry: HomeMapSourceGeometry,
): readonly AlignPair[] => [...roomPairs(source, geometry), ...dockPair(source, geometry)];

function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const high = sorted[mid] ?? 0;
  return sorted.length % 2 === 1 ? high : ((sorted[mid - 1] ?? high) + high) / 2;
}

const identityChanged = (source: HomeMapSource, geometry: HomeMapSourceGeometry): boolean => {
  const held = source.frame.uid;
  const next = geometry.frame.uid;
  return held !== null && next !== null && held !== next;
};

export function frameMoved(
  transform: RectifyTransform,
  pairs: readonly AlignPair[],
  identity: boolean,
): boolean {
  if (identity) return true;
  if (pairs.length < MIN_PAIRS) return false;
  const shifts = pairs.map((pair) => {
    const at = rectifyPoint(transform, pair.robot);
    return Math.hypot(at.x - pair.house.x, at.y - pair.house.y);
  });
  return medianOf(shifts) > FRAME_MOVED_M;
}

export function movedNoticeOps(
  notices: readonly HomeMapNotice[],
  sourceId: string,
  detail: string,
  at: { readonly createdAt: string; readonly newId: () => string },
): readonly HomeMapOp[] {
  const held = notices.find((n) => n.kind === 'source_moved' && n.elementId === sourceId);
  if (held === undefined) {
    const element = HOME_MAP_NOTICE_WRITE.parse({
      id: at.newId(),
      kind: 'source_moved',
      elementId: sourceId,
      detail,
      createdAt: at.createdAt,
    });
    return [{ op: 'add', kind: 'notice', element }];
  }
  return held.detail === detail
    ? []
    : [{ op: 'update', kind: 'notice', id: held.id, patch: { detail } }];
}

export const alignedNoticeOps = (
  notices: readonly HomeMapNotice[],
  sourceId: string,
): readonly HomeMapOp[] =>
  notices
    .filter((n) => n.kind === 'source_moved' && n.elementId === sourceId)
    .map((n): HomeMapOp => ({ op: 'remove', kind: 'notice', id: n.id }));

export const alignFrameCheck: FrameCheck = (input: FrameCheckInput) => {
  const { map, source, geometry, importedAt, newId } = input;
  const pairs = framePairs(source, geometry);
  if (!frameMoved(source.transform, pairs, identityChanged(source, geometry))) {
    return { kind: 'keep' };
  }
  const fit = fitRigidTransform(pairs, source.transform.mirrored);
  const notice = (detail: string): readonly HomeMapOp[] =>
    movedNoticeOps(map.notices, source.id, detail, { createdAt: importedAt, newId });
  if (fit === null || fit.rmsM >= FRAME_RESIDUAL_M) {
    return { kind: 'refuse', ops: notice(FRAME_REFUSED_TEXT) };
  }
  return { kind: 'realign', transform: fit.transform, ops: notice(FRAME_REALIGNED_TEXT) };
};
