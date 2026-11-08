import {
  HOME_MAP_GRID_FINE_M,
  HOME_MAP_GRID_M,
  HOME_MAP_ROTATION_STEP_DEG,
  homeMapSnapRotation,
} from '@smarteverything/domain/home-map-edit-core';
import type { HomeMapVec } from '@smarteverything/domain/home-map-geometry';
import type { HomeMapWall } from '@smarteverything/domain/home-map-elements';
import { degreesText, metresText, type Modifiers } from '../../edit/gestures';
import type { Point } from '../render-core-gestures';
import { UP, axisDir, edgeOn, lineParam, planOfWorld, type GizmoView } from './gizmo';
import { gizmoLayout } from './gizmo-handles';
import {
  edgeStep,
  fixedMetres,
  flatAt,
  gridOf,
  liveLabel,
  poseOf,
  stepped,
  topStep,
  uniformStep,
  type GizmoGrab,
  type GizmoHooks,
  type GizmoMotion,
  type GizmoPointer,
  type GizmoStep,
} from './gizmo-scale';
import type { DragSession, DragStart, EditEventDraft, StartDrag } from './pointer';
import { rayAt, type MoveItem } from './sessions';
import {
  HandleDragUnavailableError,
  moveDrags,
  moveEvent,
  type MovePose,
} from './sessions-factory';
import { seatOnWall } from './sessions-wall';

const DEGREES_PER_RADIAN = 180 / Math.PI;
const LENGTH_EPS = 1e-9;

type FlatAxis = 'x' | 'y';

function moved(item: MoveItem, pose: MovePose, text: string): GizmoMotion {
  return {
    event: moveEvent(item, pose),
    preview: {
      pose,
      size: null,
      tall: null,
      guides: [],
      labels: [liveLabel(pose.at, pose.height + item.tall, text)],
    },
  };
}

function positionText(at: HomeMapVec): string {
  return `X ${fixedMetres(at.x)}  Y ${fixedMetres(at.y)} m`;
}

function heightText(height: number): string {
  return `${metresText(height)} above floor`;
}

function wallOf(view: GizmoView, item: MoveItem): HomeMapWall | null {
  const wallId = item.wall?.wallId;
  return view.edit.floor.walls.find((wall) => wall.id === wallId) ?? null;
}

function alongWall(wall: HomeMapWall, dir: HomeMapVec): number {
  const dx = wall.to.x - wall.from.x;
  const dy = wall.to.y - wall.from.y;
  const length = Math.hypot(dx, dy);
  return length < LENGTH_EPS ? 0 : (dir.x * dx + dir.y * dy) / length;
}

interface WallShift {
  readonly along: number;
  readonly height: number;
}

function onWall(
  view: GizmoView,
  item: MoveItem,
  shift: WallShift,
  modifiers: Modifiers,
): MovePose | null {
  const wall = wallOf(view, item);
  if (wall === null || item.wall === null) return null;
  const offset = Math.max(0, item.wall.offset + shift.along);
  const seat = { wall, offset, side: item.wall.side, height: shift.height };
  const placed = seatOnWall(view, item, seat, modifiers);
  if (placed === null) return null;
  const { at, rotation, height } = placed;
  return poseOf(item, { at, rotation, height, wall: placed.wall });
}

function slideStep(grab: GizmoGrab, axis: FlatAxis): GizmoStep {
  const { item } = grab;
  const { frame } = grab.layout;
  const dir = axisDir(frame, axis);
  const plan = planOfWorld(dir);
  const start = lineParam(grab.ray, frame.centre, dir);
  return (view, { ray }, modifiers) => {
    const now = lineParam(ray, frame.centre, dir);
    if (start === null || now === null) return null;
    const shift = now - start;
    const wall = wallOf(view, item);
    if (wall !== null) {
      const along = shift * alongWall(wall, plan);
      const pose = onWall(view, item, { along, height: item.height }, modifiers);
      return pose === null ? null : moved(item, pose, positionText(pose.at));
    }
    const delta = stepped(shift, gridOf(view, modifiers, HOME_MAP_GRID_M));
    const at = { x: item.box.at.x + plan.x * delta, y: item.box.at.y + plan.y * delta };
    return moved(item, poseOf(item, { at }), positionText(at));
  };
}

function liftStep(grab: GizmoGrab): GizmoStep {
  const { item } = grab;
  const { frame } = grab.layout;
  const start = lineParam(grab.ray, frame.centre, UP);
  return (view, { ray }, modifiers) => {
    const now = lineParam(ray, frame.centre, UP);
    if (start === null || now === null) return null;
    const wanted = item.height + now - start;
    if (wallOf(view, item) !== null) {
      const pose = onWall(view, item, { along: 0, height: wanted }, modifiers);
      return pose === null ? null : moved(item, pose, heightText(pose.height));
    }
    const height = Math.max(0, stepped(wanted, gridOf(view, modifiers, HOME_MAP_GRID_FINE_M)));
    return moved(item, poseOf(item, { height }), heightText(height));
  };
}

type RingAngle = (pointer: GizmoPointer) => number | null;

function planeAngle(grab: GizmoGrab): RingAngle {
  const { frame } = grab.layout;
  const centre = planOfWorld(frame.centre);
  return ({ ray }) => {
    const hit = flatAt(ray, frame.centre[1]);
    if (hit === null) return null;
    return Math.atan2(hit.y - centre.y, hit.x - centre.x) * DEGREES_PER_RADIAN;
  };
}

function screenAngle(view: GizmoView, grab: GizmoGrab): RingAngle {
  const { screen, centre } = grab.layout.frame;
  const sense = view.camera.position.y >= centre[1] ? 1 : -1;
  return ({ at }) => {
    if (Math.hypot(at.x - screen.x, at.y - screen.y) < LENGTH_EPS) return null;
    return sense * Math.atan2(screen.y - at.y, at.x - screen.x) * DEGREES_PER_RADIAN;
  };
}

export function ringAngleOf(view: GizmoView, grab: GizmoGrab): RingAngle {
  const { centre } = grab.layout.frame;
  return edgeOn(view, centre, UP) ? screenAngle(view, grab) : planeAngle(grab);
}

function ringStep(view: GizmoView, grab: GizmoGrab): GizmoStep {
  const { item } = grab;
  const angleOf = ringAngleOf(view, grab);
  const start = angleOf({ ray: grab.ray, at: grab.from });
  return (now, pointer, modifiers) => {
    const angle = angleOf(pointer);
    if (start === null || angle === null) return null;
    const step = gridOf(now, modifiers, HOME_MAP_ROTATION_STEP_DEG);
    const degrees = homeMapSnapRotation(item.box.rotation + angle - start, step);
    const pose = poseOf(item, { rotation: degrees });
    return {
      event: { type: 'rotate', id: item.id, degrees },
      preview: {
        pose,
        size: null,
        tall: null,
        guides: [],
        labels: [liveLabel(pose.at, item.height + item.tall, degreesText(degrees))],
      },
    };
  };
}

class GizmoSession implements DragSession {
  private motion: GizmoMotion | null = null;

  constructor(
    private readonly hooks: GizmoHooks,
    private readonly step: GizmoStep,
  ) {}

  move(at: Point, modifiers: Modifiers): void {
    const view = this.hooks.view();
    const motion = this.step(view, { ray: rayAt(view, at), at }, modifiers);
    if (motion === null) return;
    this.motion = motion;
    this.hooks.preview(motion.preview);
  }

  readonly twist = (): void => undefined;

  end(): EditEventDraft | null {
    return this.motion === null ? null : this.motion.event;
  }

  cancel(): void {
    this.motion = null;
    this.hooks.preview(null);
  }
}

function stepOf(view: GizmoView, grab: GizmoGrab): GizmoStep | null {
  switch (grab.handle.kind) {
    case 'axis-x':
      return slideStep(grab, 'x');
    case 'axis-y':
      return slideStep(grab, 'y');
    case 'axis-z':
      return liftStep(grab);
    case 'ring':
      return ringStep(view, grab);
    case 'corner':
    case 'side':
      return edgeStep(grab);
    case 'top':
      return topStep(grab);
    case 'uniform':
      return uniformStep(grab);
    case 'plane':
      return null;
  }
}

export function gizmoDrags(hooks: GizmoHooks): StartDrag {
  const moves = moveDrags({
    view: hooks.view,
    preview: (preview) => {
      hooks.preview(preview === null ? null : { ...preview, tall: null });
    },
  });
  return (start: DragStart): DragSession => {
    if (start.grab.kind === 'body') return moves(start);
    const { handleId } = start.grab;
    const view = hooks.view();
    const layout = gizmoLayout(view);
    const handle = layout?.handles.find((each) => each.id === handleId);
    if (layout === null || handle === undefined || layout.subject.kind !== 'item') {
      throw new HandleDragUnavailableError(handleId);
    }
    const { item } = layout.subject;
    const grab = { layout, item, handle, ray: rayAt(view, start.from), from: start.from };
    const step = stepOf(view, grab);
    if (step === null) return moves({ ...start, grab: { kind: 'body', id: layout.frame.id } });
    return new GizmoSession(hooks, step);
  };
}
