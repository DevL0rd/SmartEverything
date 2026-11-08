import type { Ray } from 'three';
import {
  HOME_MAP_GRID_M,
  HOME_MAP_WALL_ANGLE_STEP_DEG,
  homeMapSnapPoint,
} from '@smarteverything/domain/home-map-edit-core';
import {
  homeMapDistance,
  homeMapRingArea,
  type HomeMapVec,
} from '@smarteverything/domain/home-map-geometry';
import type { HomeMapRoom, HomeMapWall } from '@smarteverything/domain/home-map-elements';
import { metresText, type Modifiers } from '../../edit/gestures';
import { HIT_RADIUS_PX } from '../../edit/radii';
import type { EditHandleTarget, EditPathGhost, EditShape } from '../map-3d-edit-protocol';
import type { Vec3 } from '../mesh';
import { free, type EditLabel } from './sessions';
import {
  SHAPE_EPS,
  ShapeTargetMissingError,
  ghost,
  label,
  midpoint,
  minus,
  plus,
  pointOn,
  radiusAt,
  same,
  steppedMetres,
  type ShapeFrame,
  type ShapeGrab,
  type ShapeStep,
  type ShapeView,
} from './sessions-shape-base';

type Ring = readonly HomeMapVec[];

type Target<K extends EditHandleTarget['kind']> = Extract<EditHandleTarget, { readonly kind: K }>;

interface PointSnap {
  readonly point: HomeMapVec;
  readonly guides: readonly EditPathGhost[];
  readonly snap: string | null;
}

interface SnapAsk {
  readonly at: HomeMapVec;
  readonly world: Vec3;
  readonly anchor: HomeMapVec | null;
  readonly walls: readonly HomeMapWall[];
  readonly corners: readonly HomeMapVec[];
}

function turn(o: HomeMapVec, a: HomeMapVec, b: HomeMapVec): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function segmentsCross(first: readonly [HomeMapVec, HomeMapVec], second: Ring): boolean {
  const [a, b] = first;
  const [c, d] = second;
  if (c === undefined || d === undefined) return false;
  return turn(c, d, a) * turn(c, d, b) < -SHAPE_EPS && turn(a, b, c) * turn(a, b, d) < -SHAPE_EPS;
}

function sideOf(ring: Ring, index: number): readonly [HomeMapVec, HomeMapVec] | null {
  const from = ring[index];
  const to = ring[(index + 1) % ring.length];
  return from === undefined || to === undefined ? null : [from, to];
}

function selfCrossing(ring: Ring): boolean {
  const count = ring.length;
  for (let i = 0; i < count; i += 1) {
    const first = sideOf(ring, i);
    for (let j = i + 2; j < count && first !== null; j += 1) {
      const second = sideOf(ring, j);
      if (!(i === 0 && j === count - 1) && second !== null && segmentsCross(first, second)) {
        return true;
      }
    }
  }
  return false;
}

export function ringValid(ring: Ring): boolean {
  return ring.length >= 3 && homeMapRingArea(ring) > SHAPE_EPS && !selfCrossing(ring);
}

export function rectRing(from: HomeMapVec, to: HomeMapVec): Ring {
  return [from, { x: to.x, y: from.y }, to, { x: from.x, y: to.y }];
}

function snapPoint(view: ShapeView, ask: SnapAsk, modifiers: Modifiers): PointSnap | null {
  if (free(view, modifiers)) return { point: ask.at, guides: [], snap: null };
  const radius = radiusAt(view, ask.world, HIT_RADIUS_PX);
  if (radius === null) return null;
  const result = homeMapSnapPoint(
    ask.at,
    ask.walls,
    {
      radius,
      gridM: HOME_MAP_GRID_M,
      points: true,
      guides: true,
      anchor: ask.anchor,
      angleStepDeg: ask.anchor === null ? null : HOME_MAP_WALL_ANGLE_STEP_DEG,
    },
    ask.corners,
  );
  const { point, kind } = result;
  const snapped = kind !== 'grid' && kind !== 'free';
  return {
    point,
    guides: result.guides.map((guide) => ghost('polyline', [guide.from, guide.to], 'snap')),
    snap: snapped ? `${kind}:${point.x.toFixed(3)},${point.y.toFixed(3)}` : null,
  };
}

function roomOf(view: ShapeView, roomId: string): HomeMapRoom {
  const room = view.edit.floor.rooms.find((each) => each.id === roomId);
  if (room === undefined) throw new ShapeTargetMissingError('room', roomId);
  return room;
}

function wallOf(view: ShapeView, wallId: string): HomeMapWall {
  const wall = view.edit.floor.walls.find((each) => each.id === wallId);
  if (wall === undefined) throw new ShapeTargetMissingError('wall', wallId);
  return wall;
}

function pointOf(ring: Ring, index: number, what: string): HomeMapVec {
  const corner = ring[index];
  if (corner === undefined) throw new ShapeTargetMissingError('corner', `${what}#${String(index)}`);
  return corner;
}

function cornerOf(room: HomeMapRoom, index: number): HomeMapVec {
  return pointOf(room.polygon.outer, index, room.id);
}

function cornersBut(view: ShapeView, roomId: string | null, index: number): Ring {
  return view.edit.floor.rooms.flatMap((room) =>
    room.polygon.outer.filter((_, at) => room.id !== roomId || at !== index),
  );
}

function shapeCornersBut(view: ShapeView, shapeId: string, index: number): Ring {
  return view.overlay.shapes.flatMap((shape) => {
    const points = shape.kind === 'ring' ? shape.points : [shape.from, shape.to];
    return points.filter((_, at) => shape.id !== shapeId || at !== index);
  });
}

function sideLabels(ring: Ring, indexes: readonly number[]): readonly EditLabel[] {
  return indexes.flatMap((index) => {
    const side = sideOf(ring, (index + ring.length) % ring.length);
    if (side === null) return [];
    return [label(midpoint(...side), metresText(homeMapDistance(...side)), 'neutral')];
  });
}

function outline(
  ghosts: readonly EditPathGhost[],
  labels: readonly EditLabel[],
): ShapeFrame['preview'] {
  return { kind: 'outline', ghosts, labels };
}

function desiredAt(
  grab: ShapeGrab,
  ray: Ray,
  view: ShapeView,
  base: HomeMapVec,
): { readonly at: HomeMapVec; readonly world: Vec3 } | null {
  const hit = pointOn(view, grab.handle, ray);
  return hit === null ? null : { at: plus(hit.point, minus(base, grab.from)), world: hit.world };
}

interface CornerDrag {
  readonly ring: Ring;
  readonly index: number;
  readonly what: string;
  readonly corners: (view: ShapeView) => Ring;
}

function cornerStep(grab: ShapeGrab, drag: CornerDrag): ShapeStep {
  const { ring, index } = drag;
  const base = pointOf(ring, index, drag.what);
  return (view, ray, modifiers) => {
    const desired = desiredAt(grab, ray, view, base);
    if (desired === null) return null;
    const corners = drag.corners(view);
    const ask = { ...desired, anchor: null, walls: view.edit.floor.walls, corners };
    const snapped = snapPoint(view, ask, modifiers);
    if (snapped === null) return null;
    const next = ring.map((point, at) => (at === index ? snapped.point : point));
    if (!ringValid(next)) return null;
    const ghosts = [ghost('polygon', next, 'accent'), ...snapped.guides];
    return {
      event: same(snapped.point, base)
        ? null
        : { type: 'vertex', handleId: grab.handle.id, point: snapped.point },
      preview: outline(ghosts, sideLabels(next, [index - 1, index])),
      snap: snapped.snap,
    };
  };
}

export function roomCornerStep(grab: ShapeGrab, target: Target<'room-corner'>): ShapeStep {
  const room = roomOf(grab.view, target.roomId);
  const { index } = target;
  const corners = (view: ShapeView): Ring => cornersBut(view, room.id, index);
  return cornerStep(grab, { ring: room.polygon.outer, index, what: room.id, corners });
}

function shapeOf<K extends EditShape['kind']>(
  view: ShapeView,
  id: string,
  kind: K,
): Extract<EditShape, { readonly kind: K }> {
  const shape = view.overlay.shapes.find((each) => each.id === id);
  if (shape === undefined || !isKind(shape, kind)) {
    throw new ShapeTargetMissingError(`${kind} shape`, id);
  }
  return shape;
}

function isKind<K extends EditShape['kind']>(
  shape: EditShape,
  kind: K,
): shape is Extract<EditShape, { readonly kind: K }> {
  return shape.kind === kind;
}

export function shapeCornerStep(grab: ShapeGrab, target: Target<'shape-corner'>): ShapeStep {
  const shape = shapeOf(grab.view, target.shapeId, 'ring');
  const { index } = target;
  const corners = (view: ShapeView): Ring => shapeCornersBut(view, shape.id, index);
  return cornerStep(grab, { ring: shape.points, index, what: shape.id, corners });
}

interface EndDrag {
  readonly base: HomeMapVec;
  readonly anchor: HomeMapVec;
  readonly walls: (view: ShapeView) => readonly HomeMapWall[];
  readonly corners: (view: ShapeView) => Ring;
}

function endStep(grab: ShapeGrab, drag: EndDrag): ShapeStep {
  const { base, anchor } = drag;
  return (view, ray, modifiers) => {
    const desired = desiredAt(grab, ray, view, base);
    if (desired === null) return null;
    const ask = { ...desired, anchor, walls: drag.walls(view), corners: drag.corners(view) };
    const snapped = snapPoint(view, ask, modifiers);
    if (snapped === null || same(snapped.point, anchor)) return null;
    const length = homeMapDistance(anchor, snapped.point);
    const ghosts = [ghost('polyline', [anchor, snapped.point], 'accent'), ...snapped.guides];
    return {
      event: same(snapped.point, base)
        ? null
        : { type: 'vertex', handleId: grab.handle.id, point: snapped.point },
      preview: outline(ghosts, [
        label(midpoint(anchor, snapped.point), metresText(length), 'neutral'),
      ]),
      snap: snapped.snap,
    };
  };
}

export function wallEndStep(grab: ShapeGrab, target: Target<'wall-end'>): ShapeStep {
  const wall = wallOf(grab.view, target.wallId);
  return endStep(grab, {
    base: target.end === 'from' ? wall.from : wall.to,
    anchor: target.end === 'from' ? wall.to : wall.from,
    walls: (view) => view.edit.floor.walls.filter((each) => each.id !== wall.id),
    corners: () => [],
  });
}

export function lineEndStep(grab: ShapeGrab, target: Target<'line-end'>): ShapeStep {
  const line = shapeOf(grab.view, target.lineId, 'line');
  const index = target.end === 'from' ? 0 : 1;
  return endStep(grab, {
    base: target.end === 'from' ? line.from : line.to,
    anchor: target.end === 'from' ? line.to : line.from,
    walls: (view) => view.edit.floor.walls,
    corners: (view) => shapeCornersBut(view, line.id, index),
  });
}

function normalOf(from: HomeMapVec, to: HomeMapVec, what: string): HomeMapVec {
  const length = homeMapDistance(from, to);
  if (length <= SHAPE_EPS) throw new ShapeTargetMissingError('side with a length', what);
  return { x: -(to.y - from.y) / length, y: (to.x - from.x) / length };
}

interface Push {
  readonly from: HomeMapVec;
  readonly to: HomeMapVec;
  readonly shape: (by: HomeMapVec) => EditPathGhost | null;
}

function pushStep(grab: ShapeGrab, push: Push, what: string): ShapeStep {
  const normal = normalOf(push.from, push.to, what);
  return (view, ray, modifiers) => {
    const hit = pointOn(view, grab.handle, ray);
    if (hit === null) return null;
    const moved = minus(hit.point, grab.from);
    const offset = steppedMetres(view, modifiers, moved.x * normal.x + moved.y * normal.y);
    const by = { x: normal.x * offset, y: normal.y * offset };
    const shape = push.shape(by);
    if (shape === null) return null;
    const at = plus(midpoint(push.from, push.to), by);
    return {
      event:
        Math.abs(offset) <= SHAPE_EPS ? null : { type: 'edge', handleId: grab.handle.id, offset },
      preview: outline([shape], [label(at, metresText(offset), 'neutral')]),
      snap: null,
    };
  };
}

export function roomSideStep(grab: ShapeGrab, target: Target<'room-side'>): ShapeStep {
  const room = roomOf(grab.view, target.roomId);
  const ring = room.polygon.outer;
  const from = cornerOf(room, target.index);
  const last = (target.index + 1) % ring.length;
  const to = cornerOf(room, last);
  const shape = (by: HomeMapVec): EditPathGhost | null => {
    const next = ring.map((point, at) =>
      at === target.index || at === last ? plus(point, by) : point,
    );
    return ringValid(next) ? ghost('polygon', next, 'accent') : null;
  };
  return pushStep(grab, { from, to, shape }, `${room.id}#${String(target.index)}`);
}

export function wallMiddleStep(grab: ShapeGrab, target: Target<'wall-middle'>): ShapeStep {
  const wall = wallOf(grab.view, target.wallId);
  const shape = (by: HomeMapVec): EditPathGhost =>
    ghost('polyline', [plus(wall.from, by), plus(wall.to, by)], 'accent');
  return pushStep(grab, { from: wall.from, to: wall.to, shape }, wall.id);
}

export function rectCornerStep(grab: ShapeGrab, target: Target<'rect-corner'>): ShapeStep {
  const { anchor } = target;
  const base = { x: grab.handle.at.x, y: grab.handle.at.y };
  return (view, ray, modifiers) => {
    const desired = desiredAt(grab, ray, view, base);
    if (desired === null) return null;
    const corners = cornersBut(view, null, -1);
    const ask = { ...desired, anchor: null, walls: view.edit.floor.walls, corners };
    const snapped = snapPoint(view, ask, modifiers);
    if (snapped === null) return null;
    const width = Math.abs(snapped.point.x - anchor.x);
    const depth = Math.abs(snapped.point.y - anchor.y);
    if (width <= SHAPE_EPS || depth <= SHAPE_EPS) return null;
    const ring = rectRing(anchor, snapped.point);
    const text = `${metresText(width)} × ${metresText(depth)}`;
    return {
      event: { type: 'rect', from: { x: anchor.x, y: anchor.y }, to: snapped.point },
      preview: outline(
        [ghost('polygon', ring, 'accent'), ...snapped.guides],
        [label(midpoint(anchor, snapped.point), text, 'neutral')],
      ),
      snap: snapped.snap,
    };
  };
}
