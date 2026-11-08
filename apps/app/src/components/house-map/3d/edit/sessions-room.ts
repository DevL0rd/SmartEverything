import type { Ray } from 'three';
import { HOME_MAP_GRID_M } from '@smarteverything/domain/home-map-edit-core';
import type { HomeMapVec } from '@smarteverything/domain/home-map-geometry';
import type { HomeMapRoom } from '@smarteverything/domain/home-map-elements';
import { metresText } from '../../edit/gestures';
import type { GizmoView } from './gizmo';
import { gizmoLayout } from './gizmo-handles';
import { planeAt } from './ground';
import type { DragGrab, StartDrag } from './pointer';
import { rayAt } from './sessions';
import { HandleDragUnavailableError } from './sessions-factory';
import {
  SHAPE_EPS,
  ShapeSession,
  ShapeTargetMissingError,
  ghost,
  gridStep,
  label,
  minus,
  plus,
  stepped,
  type ShapeHooks,
  type ShapeStep,
  type ShapeView,
} from './sessions-shape-base';

export type RoomDragView = GizmoView & ShapeView;

export interface RoomDragHooks {
  readonly view: () => RoomDragView;
  readonly preview: ShapeHooks['preview'];
}

function roomOf(view: ShapeView, roomId: string): HomeMapRoom {
  const room = view.edit.floor.rooms.find((each) => each.id === roomId);
  if (room === undefined) throw new ShapeTargetMissingError('room', roomId);
  return room;
}

function groundOf(view: ShapeView, ray: Ray): HomeMapVec | null {
  const hit = planeAt(ray, view.edit.floor.elevation);
  return hit === null ? null : { x: hit.world[0], y: -hit.world[2] };
}

function centreOf(points: readonly HomeMapVec[]): HomeMapVec {
  const sum = points.reduce((total, point) => plus(total, point), { x: 0, y: 0 });
  const count = Math.max(1, points.length);
  return { x: sum.x / count, y: sum.y / count };
}

function shiftOf(raw: HomeMapVec, axis: HomeMapVec | null, step: number | null): HomeMapVec {
  if (axis === null) return { x: stepped(raw.x, step), y: stepped(raw.y, step) };
  const along = stepped(raw.x * axis.x + raw.y * axis.y, step);
  return { x: axis.x * along, y: axis.y * along };
}

function offsetText(by: HomeMapVec): string {
  return `${metresText(by.x)} · ${metresText(by.y)}`;
}

export function roomMoveStep(
  view: ShapeView,
  roomId: string,
  from: HomeMapVec | null,
  axis: HomeMapVec | null,
): ShapeStep {
  const room = roomOf(view, roomId);
  const outer = room.polygon.outer;
  return (now, ray, modifiers) => {
    const hit = groundOf(now, ray);
    if (from === null || hit === null) return null;
    const by = shiftOf(minus(hit, from), axis, gridStep(now, modifiers, HOME_MAP_GRID_M));
    const ring = outer.map((point) => plus(point, by));
    const still = Math.hypot(by.x, by.y) <= SHAPE_EPS;
    return {
      event: still ? null : { type: 'room-move', id: room.id, by },
      preview: {
        kind: 'outline',
        ghosts: [ghost('polygon', ring, 'accent')],
        labels: [label(centreOf(ring), offsetText(by), 'neutral')],
      },
      snap: null,
    };
  };
}

export function roomOfGrab(view: RoomDragView, grab: DragGrab): string | null {
  const { overlay } = view;
  const isRoom = (id: string): boolean => view.edit.floor.rooms.some((room) => room.id === id);
  if (grab.kind === 'body') return isRoom(grab.id) ? grab.id : null;
  if (overlay.handles.some((handle) => handle.id === grab.handleId)) return null;
  const [only, ...rest] = overlay.selection;
  return only !== undefined && rest.length === 0 && isRoom(only) ? only : null;
}

function axisOf(view: RoomDragView, grab: DragGrab): HomeMapVec | null {
  if (grab.kind === 'body') return null;
  const layout = gizmoLayout(view);
  const handle = layout?.handles.find((each) => each.id === grab.handleId);
  if (layout === null || handle === undefined) throw new HandleDragUnavailableError(grab.handleId);
  if (handle.kind === 'axis-x') return layout.frame.east;
  if (handle.kind === 'axis-y') return layout.frame.north;
  if (handle.kind === 'plane') return null;
  throw new HandleDragUnavailableError(grab.handleId);
}

export class RoomGrabMissingError extends Error {
  constructor() {
    super('A room drag started on something that is not a room');
    this.name = 'RoomGrabMissingError';
  }
}

export function roomDrags(hooks: RoomDragHooks): StartDrag {
  return (start) => {
    const view = hooks.view();
    const roomId = roomOfGrab(view, start.grab);
    if (roomId === null) throw new RoomGrabMissingError();
    const from = groundOf(view, rayAt(view, start.from));
    const step = roomMoveStep(view, roomId, from, axisOf(view, start.grab));
    return new ShapeSession(hooks, start, step);
  };
}
