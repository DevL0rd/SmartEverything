import {
  homeMapEditToWorld,
  type HomeMapEditBox,
  type HomeMapHandleSign,
} from '@smarteverything/domain/home-map-edit-core';
import type { HomeMapVec } from '@smarteverything/domain/home-map-geometry';
import type { Vec3 } from '../mesh';
import type { Point } from '../render-core-gestures';
import {
  UP,
  along,
  axisDir,
  clearAlong,
  edgeOn,
  gap,
  gizmoFrameOf,
  levelAtScreen,
  lineAtScreen,
  offsetPoint,
  planDir,
  pointsAtCamera,
  toScreen,
  unit,
  worldOfPlan,
  type GizmoAxis,
  type GizmoFrame,
  type GizmoTarget,
  type GizmoView,
} from './gizmo';
import type { HandleCentre } from './pointer';
import { moveItemOf, type MoveItem } from './sessions';

const RING_SPACING_TARGETS = 0.25;
export const SCALE_HALF_TARGETS = 1.5;
const SCALE_SIDE_TARGETS = 3;

const RING_QUARTERS = 4;
const FULL_TURN = Math.PI * 2;
const RIGHT_ANGLE_DEG = 90;

export type GizmoKind =
  'axis-x' | 'axis-y' | 'axis-z' | 'plane' | 'ring' | 'corner' | 'side' | 'top' | 'uniform';

export type GizmoSigns = readonly [HomeMapHandleSign, HomeMapHandleSign];

export interface GizmoHandle {
  readonly id: string;
  readonly kind: GizmoKind;
  readonly target: GizmoTarget;
  readonly signs: GizmoSigns;
  readonly world: Vec3;
  readonly screen: Point;
  readonly hits: readonly HandleCentre[];
}

export interface ScaleFrame {
  readonly box: HomeMapEditBox;
  readonly tall: number;
  readonly half: HomeMapVec;
  readonly grown: boolean;
}

export type GizmoSubject =
  | { readonly kind: 'item'; readonly item: MoveItem }
  | { readonly kind: 'room'; readonly roomId: string };

export interface GizmoLayout {
  readonly frame: GizmoFrame;
  readonly subject: GizmoSubject;
  readonly scale: ScaleFrame | null;
  readonly handles: readonly GizmoHandle[];
}

const AXIS_KINDS = { x: 'axis-x', y: 'axis-y', z: 'axis-z' } as const;

const NO_SIGNS: GizmoSigns = [0, 0];

const AXES: readonly GizmoAxis[] = ['x', 'y', 'z'];

const SIGNS = [1, -1] as const;

const CORNERS: readonly GizmoSigns[] = [
  [1, 1],
  [1, -1],
  [-1, -1],
  [-1, 1],
];

export function gizmoHandleId(kind: GizmoKind, signs: GizmoSigns): string {
  return `gizmo:${kind}:${String(signs[0])}:${String(signs[1])}`;
}

function handleAt(
  view: GizmoView,
  frame: GizmoFrame,
  part: { readonly kind: GizmoKind; readonly signs: GizmoSigns },
  world: Vec3,
): GizmoHandle | null {
  const screen = toScreen(view, world);
  if (screen === null) return null;
  const id = gizmoHandleId(part.kind, part.signs);
  return {
    id,
    kind: part.kind,
    target: { kind: 'gizmo', id: frame.id },
    signs: part.signs,
    world,
    screen,
    hits: [{ id, x: screen.x, y: screen.y }],
  };
}

function shown(handle: GizmoHandle | null): readonly GizmoHandle[] {
  return handle === null ? [] : [handle];
}

function arrow(
  view: GizmoView,
  frame: GizmoFrame,
  axis: GizmoAxis,
  blockers: readonly Point[],
): GizmoHandle | null {
  const dir = axisDir(frame, axis);
  if (pointsAtCamera(view, frame.centre, dir)) return null;
  const base = toScreen(view, along(frame.centre, dir, frame.metres));
  const towards = base === null ? null : unit(frame.screen, base);
  if (base === null || towards === null) return null;
  const path = { start: frame.screen, dir: towards, from: gap(frame.screen, base) };
  const reach = clearAlong(path, [frame.screen, ...blockers], frame.sizes.targetPx);
  const tip = lineAtScreen(view, offsetPoint(frame.screen, towards, reach), frame.centre, dir);
  return tip === null
    ? null
    : handleAt(view, frame, { kind: AXIS_KINDS[axis], signs: NO_SIGNS }, tip);
}

function planeSquare(
  view: GizmoView,
  frame: GizmoFrame,
  axes: readonly GizmoAxis[],
  blockers: readonly Point[],
): GizmoHandle | null {
  if (!axes.includes('x') || !axes.includes('y') || edgeOn(view, frame.centre, UP)) return null;
  const bisector = worldOfPlan({
    x: (frame.east.x + frame.north.x) * Math.SQRT1_2,
    y: (frame.east.y + frame.north.y) * Math.SQRT1_2,
  });
  const towards = toScreen(view, along(frame.centre, bisector, frame.metres));
  const dir = towards === null ? null : unit(frame.screen, towards);
  if (dir === null) return null;
  const path = { start: frame.screen, dir, from: 0 };
  const reach = clearAlong(path, [frame.screen, ...blockers], frame.sizes.targetPx);
  const world = levelAtScreen(view, offsetPoint(frame.screen, dir, reach), frame.centre[1]);
  return world === null ? null : handleAt(view, frame, { kind: 'plane', signs: NO_SIGNS }, world);
}

function moveHandles(
  view: GizmoView,
  frame: GizmoFrame,
  axes: readonly GizmoAxis[],
): readonly GizmoHandle[] {
  const tips: GizmoHandle[] = [];
  for (const axis of AXES.filter((each) => axes.includes(each))) {
    const tip = arrow(
      view,
      frame,
      axis,
      tips.map((each) => each.screen),
    );
    if (tip !== null) tips.push(tip);
  }
  const plane = planeSquare(
    view,
    frame,
    axes,
    tips.map((tip) => tip.screen),
  );
  return [...tips, ...shown(plane)];
}

function ringPoint(frame: GizmoFrame, angle: number): Vec3 {
  const east = worldOfPlan(frame.east);
  const north = worldOfPlan(frame.north);
  const reach = frame.metres;
  return along(along(frame.centre, east, Math.cos(angle) * reach), north, Math.sin(angle) * reach);
}

function ringHits(view: GizmoView, frame: GizmoFrame, id: string): readonly HandleCentre[] {
  const spacing = frame.sizes.targetPx * RING_SPACING_TARGETS;
  const step = FULL_TURN / RING_QUARTERS;
  const arcs = Array.from({ length: RING_QUARTERS }, (_, index) => ({
    from: index * step,
    to: (index + 1) * step,
  }));
  const hits: HandleCentre[] = [];
  for (let arc = arcs.pop(); arc !== undefined; arc = arcs.pop()) {
    const start = toScreen(view, ringPoint(frame, arc.from));
    const end = toScreen(view, ringPoint(frame, arc.to));
    if (start === null || end === null) continue;
    if (gap(start, end) <= spacing) {
      hits.push({ id, x: start.x, y: start.y });
      continue;
    }
    const middle = (arc.from + arc.to) / 2;
    arcs.push({ from: arc.from, to: middle }, { from: middle, to: arc.to });
  }
  return hits;
}

function rotateHandles(view: GizmoView, frame: GizmoFrame, item: MoveItem): readonly GizmoHandle[] {
  if (item.mount === 'wall') return [];
  const knob = handleAt(
    view,
    frame,
    { kind: 'ring', signs: NO_SIGNS },
    ringPoint(frame, Math.PI / 2),
  );
  if (knob === null) return [];
  return [{ ...knob, hits: [...knob.hits, ...ringHits(view, frame, knob.id)] }];
}

function halfAlong(view: GizmoView, frame: GizmoFrame, dir: Vec3, pixels: number): number | null {
  let half = 0;
  for (const sign of SIGNS) {
    const end = toScreen(view, along(frame.centre, dir, sign * frame.metres));
    const towards = end === null ? null : unit(frame.screen, end);
    if (towards === null) return null;
    const reached = lineAtScreen(
      view,
      offsetPoint(frame.screen, towards, pixels),
      frame.centre,
      dir,
    );
    if (reached === null) return null;
    const [x, y, z] = frame.centre;
    half = Math.max(half, Math.hypot(reached[0] - x, reached[1] - y, reached[2] - z));
  }
  return half;
}

function scaleFrameOf(view: GizmoView, frame: GizmoFrame, item: MoveItem): ScaleFrame | null {
  if (item.object === null) return null;
  const { box } = item;
  const least = SCALE_HALF_TARGETS * frame.sizes.targetPx;
  const depth = halfAlong(view, frame, worldOfPlan(planDir(box.rotation)), least);
  const width = halfAlong(view, frame, worldOfPlan(planDir(box.rotation + RIGHT_ANGLE_DEG)), least);
  if (depth === null || width === null) return null;
  const half = { x: Math.max(box.d / 2, depth), y: Math.max(box.w / 2, width) };
  return { box, tall: item.tall, half, grown: half.x > box.d / 2 || half.y > box.w / 2 };
}

function framePoint(frame: GizmoFrame, scale: ScaleFrame, signs: GizmoSigns): Vec3 {
  const plan = homeMapEditToWorld(scale.box, {
    x: signs[0] * scale.half.x,
    y: signs[1] * scale.half.y,
  });
  return [plan.x, frame.centre[1], -plan.y];
}

function sideHandles(
  view: GizmoView,
  frame: GizmoFrame,
  scale: ScaleFrame,
): readonly GizmoHandle[] {
  const least = SCALE_SIDE_TARGETS * frame.sizes.targetPx;
  const length = (from: GizmoSigns, to: GizmoSigns): number => {
    const a = toScreen(view, framePoint(frame, scale, from));
    const b = toScreen(view, framePoint(frame, scale, to));
    return a === null || b === null ? 0 : gap(a, b);
  };
  const sides: readonly GizmoSigns[] = [
    ...(length([1, -1], [1, 1]) >= least
      ? ([
          [1, 0],
          [-1, 0],
        ] as const)
      : []),
    ...(length([-1, 1], [1, 1]) >= least
      ? ([
          [0, 1],
          [0, -1],
        ] as const)
      : []),
  ];
  return sides.flatMap((signs) =>
    shown(handleAt(view, frame, { kind: 'side', signs }, framePoint(frame, scale, signs))),
  );
}

function topHandle(
  view: GizmoView,
  frame: GizmoFrame,
  scale: ScaleFrame,
  blockers: readonly Point[],
): GizmoHandle | null {
  if (pointsAtCamera(view, frame.centre, UP)) return null;
  const top = along(frame.centre, UP, scale.tall);
  const start = toScreen(view, top);
  const lifted = toScreen(view, along(top, UP, frame.metres));
  const dir = start === null || lifted === null ? null : unit(start, lifted);
  if (start === null || dir === null) return null;
  const rim = CORNERS.flatMap((signs) => {
    const corner = toScreen(view, along(framePoint(frame, scale, signs), UP, scale.tall));
    return corner === null ? [] : [(corner.x - start.x) * dir.x + (corner.y - start.y) * dir.y];
  });
  const from = Math.max(0, ...rim) + frame.sizes.targetPx;
  const reach = clearAlong({ start, dir, from }, blockers, frame.sizes.targetPx);
  const world = lineAtScreen(view, offsetPoint(start, dir, reach), top, UP);
  return world === null ? null : handleAt(view, frame, { kind: 'top', signs: NO_SIGNS }, world);
}

function uniformHandle(
  view: GizmoView,
  frame: GizmoFrame,
  corners: readonly GizmoHandle[],
  blockers: readonly Point[],
): GizmoHandle | null {
  const corner = corners.reduce<GizmoHandle | null>(
    (best, each) =>
      best === null || each.screen.x - each.screen.y > best.screen.x - best.screen.y ? each : best,
    null,
  );
  const dir = corner === null ? null : unit(frame.screen, corner.screen);
  if (corner === null || dir === null) return null;
  const path = { start: corner.screen, dir, from: frame.sizes.targetPx };
  const reach = clearAlong(path, [frame.screen, ...blockers], frame.sizes.targetPx);
  const world = levelAtScreen(view, offsetPoint(corner.screen, dir, reach), frame.centre[1]);
  return world === null
    ? null
    : handleAt(view, frame, { kind: 'uniform', signs: corner.signs }, world);
}

function scaleHandles(
  view: GizmoView,
  frame: GizmoFrame,
  scale: ScaleFrame,
): readonly GizmoHandle[] {
  const corners = CORNERS.flatMap((signs) =>
    shown(handleAt(view, frame, { kind: 'corner', signs }, framePoint(frame, scale, signs))),
  );
  const ring = [...corners, ...sideHandles(view, frame, scale)];
  const top = topHandle(
    view,
    frame,
    scale,
    ring.map((handle) => handle.screen),
  );
  const placed = [...ring, ...shown(top)];
  const uniform = uniformHandle(
    view,
    frame,
    corners,
    placed.map((handle) => handle.screen),
  );
  return [...placed, ...shown(uniform)];
}

function subjectOf(view: GizmoView, id: string): GizmoSubject | null {
  const { floor } = view.edit;
  if (floor.rooms.some((room) => room.id === id)) return { kind: 'room', roomId: id };
  const known =
    floor.objects.some((object) => object.id === id) ||
    floor.placements.some((placement) => placement.deviceId === id);
  return known ? { kind: 'item', item: moveItemOf(view.edit, id) } : null;
}

const ROOM_AXES: readonly GizmoAxis[] = ['x', 'y'];

function roomLayout(view: GizmoView, frame: GizmoFrame, subject: GizmoSubject): GizmoLayout {
  const axes = frame.gizmo.axes.filter((axis) => ROOM_AXES.includes(axis));
  const handles = frame.gizmo.mode === 'move' ? moveHandles(view, frame, axes) : [];
  return { frame, subject, scale: null, handles };
}

function itemLayout(view: GizmoView, frame: GizmoFrame, item: MoveItem): GizmoLayout {
  const subject: GizmoSubject = { kind: 'item', item };
  switch (frame.gizmo.mode) {
    case 'move':
      return { frame, subject, scale: null, handles: moveHandles(view, frame, frame.gizmo.axes) };
    case 'rotate':
      return { frame, subject, scale: null, handles: rotateHandles(view, frame, item) };
    case 'scale': {
      const scale = scaleFrameOf(view, frame, item);
      const handles = scale === null ? [] : scaleHandles(view, frame, scale);
      return { frame, subject, scale, handles };
    }
  }
}

export function gizmoLayout(view: GizmoView): GizmoLayout | null {
  const frame = gizmoFrameOf(view);
  const subject = frame === null ? null : subjectOf(view, frame.id);
  if (frame === null || subject === null) return null;
  return subject.kind === 'room'
    ? roomLayout(view, frame, subject)
    : itemLayout(view, frame, subject.item);
}

export function gizmoCentres(layout: GizmoLayout | null): readonly HandleCentre[] {
  return layout === null ? [] : layout.handles.flatMap((handle) => handle.hits);
}
