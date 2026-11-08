import type { Vec3 } from '../mesh';
import type { Point } from '../render-core-gestures';
import {
  UP,
  along,
  planDir,
  toScreen,
  unit,
  worldOfPlan,
  type GizmoFrame,
  type GizmoView,
} from './gizmo';
import { gizmoLayout, type GizmoHandle, type GizmoLayout } from './gizmo-handles';
import {
  HANDLE_LABELS,
  handleSizeOf,
  handleStateOf,
  pathOf,
  type Disc,
  type DrawnHandle,
  type DrawnPath,
  type OverlayDrag,
  type PathLook,
} from './overlay-model';
import type { PointerHover } from './pointer';

const RING_SAMPLES = 72;
const FULL_TURN_DEG = 360;
const RIGHT_ANGLE_DEG = 90;
const TICK_STEP_DEG = 15;
const TICK_REACH = 1.12;
const MAJOR_TICK_REACH = 1.24;
const WEDGE_STEP_DEG = 5;
const DEGREES_PER_RADIAN = 180 / Math.PI;

const SHAFT_LOOKS: Partial<Readonly<Record<GizmoHandle['kind'], PathLook>>> = {
  'axis-x': 'shaft-x',
  'axis-y': 'shaft-y',
  'axis-z': 'shaft-z',
};

function shaftOf(kind: GizmoHandle['kind']): PathLook | null {
  return SHAFT_LOOKS[kind] ?? null;
}

interface PathPart {
  readonly key: string;
  readonly d: string;
  readonly look: PathLook;
  readonly id: string;
}

export interface GizmoDrawing {
  readonly handles: readonly DrawnHandle[];
  readonly paths: readonly DrawnPath[];
  readonly discs: readonly Disc[];
  readonly centre: Point;
  readonly top: number;
}

interface Painting {
  readonly view: GizmoView;
  readonly layout: GizmoLayout;
  readonly drag: OverlayDrag;
  readonly startTurn: number;
  readonly hover: PointerHover | null;
}

function local(view: GizmoView, point: Point): Point {
  return { x: point.x - view.bounds.left, y: point.y - view.bounds.top };
}

function projected(view: GizmoView, world: Vec3): Point | null {
  const point = toScreen(view, world);
  return point === null ? null : local(view, point);
}

function projectAll(view: GizmoView, worlds: readonly Vec3[]): readonly Point[] {
  return worlds.flatMap((world) => {
    const point = projected(view, world);
    return point === null ? [] : [point];
  });
}

function onRing(frame: GizmoFrame, degrees: number, reach: number): Vec3 {
  return along(frame.centre, worldOfPlan(planDir(degrees)), frame.metres * reach);
}

function headAngle(from: Point, to: Point): number {
  return Math.atan2(to.y - from.y, to.x - from.x) * DEGREES_PER_RADIAN;
}

function drawnHandle(painting: Painting, handle: GizmoHandle): DrawnHandle {
  const { view, layout, drag } = painting;
  const at = local(view, handle.screen);
  const centre = local(view, layout.frame.screen);
  const arrow = shaftOf(handle.kind) !== null;
  const state = handleStateOf(handle.id, drag.grab, painting.hover);
  return {
    id: handle.id,
    kind: handle.kind,
    x: at.x,
    y: at.y,
    angle: arrow ? headAngle(centre, at) : 0,
    size: handleSizeOf(layout.frame.sizes.handlePx, state),
    target: layout.frame.sizes.targetPx,
    state,
    label: HANDLE_LABELS[handle.kind],
  };
}

function path(painting: Painting, part: PathPart): DrawnPath {
  const { key, d, look, id } = part;
  return { key, d, look, tone: null, state: handleStateOf(id, painting.drag.grab, null) };
}

function shafts(painting: Painting, centre: Point): readonly DrawnPath[] {
  return painting.layout.handles.flatMap((handle) => {
    const look = shaftOf(handle.kind);
    if (look === null) return [];
    const d = pathOf([centre, local(painting.view, handle.screen)], false);
    return [path(painting, { key: `shaft:${handle.id}`, d, look, id: handle.id })];
  });
}

function axisGuide(painting: Painting, centre: Point): readonly DrawnPath[] {
  const { grab } = painting.drag;
  if (grab?.kind !== 'handle') return [];
  const handle = painting.layout.handles.find((each) => each.id === grab.handleId);
  if (handle === undefined || shaftOf(handle.kind) === null) return [];
  const dir = unit(centre, local(painting.view, handle.screen));
  if (dir === null) return [];
  const reach = painting.view.viewport.width + painting.view.viewport.height;
  const ends = [-reach, reach].map((length) => ({
    x: centre.x + dir.x * length,
    y: centre.y + dir.y * length,
  }));
  return [
    { key: 'axis-guide', d: pathOf(ends, false), look: 'axis-guide', tone: null, state: 'rest' },
  ];
}

function ringPaths(painting: Painting, ring: GizmoHandle): readonly DrawnPath[] {
  const { view, layout } = painting;
  const { frame } = layout;
  const samples = Array.from({ length: RING_SAMPLES }, (_, index) =>
    onRing(frame, (index * FULL_TURN_DEG) / RING_SAMPLES, 1),
  );
  const d = pathOf(projectAll(view, samples), true);
  const loop = path(painting, { key: 'ring', d, look: 'ring', id: ring.id });
  if (handleStateOf(ring.id, painting.drag.grab, null) !== 'active') return [loop];
  return [...ticks(painting), wedge(painting), { ...loop, state: 'active' }];
}

function ticks(painting: Painting): readonly DrawnPath[] {
  const { view, layout } = painting;
  const count = FULL_TURN_DEG / TICK_STEP_DEG;
  return Array.from({ length: count }, (_, index) => {
    const degrees = index * TICK_STEP_DEG;
    const major = degrees % RIGHT_ANGLE_DEG === 0;
    const reach = major ? MAJOR_TICK_REACH : TICK_REACH;
    const ends = projectAll(view, [
      onRing(layout.frame, degrees, 1),
      onRing(layout.frame, degrees, reach),
    ]);
    const look: PathLook = major ? 'tick-major' : 'tick';
    return {
      key: `tick:${String(index)}`,
      d: pathOf(ends, false),
      look,
      tone: null,
      state: 'rest',
    };
  });
}

function wedge(painting: Painting): DrawnPath {
  const { view, layout, startTurn } = painting;
  const { frame } = layout;
  const from = startTurn + RIGHT_ANGLE_DEG;
  const sweep = frame.gizmo.turn - startTurn;
  const steps = Math.max(1, Math.ceil(Math.abs(sweep) / WEDGE_STEP_DEG));
  const arc = Array.from({ length: steps + 1 }, (_, index) =>
    along(frame.centre, worldOfPlan(planDir(from + (sweep * index) / steps)), frame.metres),
  );
  const points = projectAll(view, [frame.centre, ...arc]);
  return { key: 'wedge', d: pathOf(points, true), look: 'wedge', tone: null, state: 'rest' };
}

function scalePaths(painting: Painting): readonly DrawnPath[] {
  const { view, layout } = painting;
  const { scale, handles, frame } = layout;
  if (scale === null) return [];
  const corners = handles.filter((handle) => handle.kind === 'corner');
  const outline = corners.map((corner) => local(view, corner.screen));
  const look: PathLook = scale.grown ? 'frame-grown' : 'frame';
  const paths: DrawnPath[] = [
    path(painting, { key: 'frame', d: pathOf(outline, true), look, id: '' }),
  ];
  const top = handles.find((handle) => handle.kind === 'top');
  const base = projected(view, along(frame.centre, UP, scale.tall));
  if (top !== undefined && base !== null) {
    const d = pathOf([base, local(view, top.screen)], false);
    paths.push(path(painting, { key: 'stalk', d, look: 'stalk', id: top.id }));
  }
  const uniform = handles.find((handle) => handle.kind === 'uniform');
  const corner = corners.find(
    (each) => uniform !== undefined && each.signs.every((sign, i) => sign === uniform.signs[i]),
  );
  if (uniform !== undefined && corner !== undefined) {
    const d = pathOf([local(view, corner.screen), local(view, uniform.screen)], false);
    paths.push(path(painting, { key: 'link', d, look: 'link', id: uniform.id }));
  }
  return paths.map((each) => (painting.drag.grab === null ? each : { ...each, state: 'faded' }));
}

function modePaths(painting: Painting, centre: Point): readonly DrawnPath[] {
  switch (painting.layout.frame.gizmo.mode) {
    case 'move':
      return [...axisGuide(painting, centre), ...shafts(painting, centre)];
    case 'rotate':
      return painting.layout.handles.flatMap((handle) =>
        handle.kind === 'ring' ? ringPaths(painting, handle) : [],
      );
    case 'scale':
      return scalePaths(painting);
  }
}

export interface GizmoPainting {
  readonly drag: OverlayDrag;
  readonly startTurn: number;
  readonly hover: PointerHover | null;
}

export function gizmoDrawing(view: GizmoView, given: GizmoPainting): GizmoDrawing | null {
  const layout = gizmoLayout(view);
  if (layout === null) return null;
  const painting: Painting = { view, layout, ...given };
  const centre = local(view, layout.frame.screen);
  const handles = layout.handles.map((handle) => drawnHandle(painting, handle));
  const discs = layout.handles.flatMap((handle) =>
    handle.hits.map((hit) => ({ ...local(view, hit), r: layout.frame.sizes.targetPx / 2 })),
  );
  const top = Math.min(centre.y, ...handles.map((handle) => handle.y - handle.size / 2));
  return { handles, paths: modePaths(painting, centre), discs, centre, top };
}
