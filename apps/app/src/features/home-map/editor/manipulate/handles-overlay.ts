import type { HomeMapFloor, HomeMapOp, HomeMapRoom, HomeMapVec } from '@smarteverything/domain';
import {
  homeMapBoxCorners,
  homeMapEditBuild,
  homeMapEditClamp,
  homeMapEditFit,
  homeMapEditInner,
  homeMapEditLimits,
  homeMapObjectBox,
  type HomeMapEditAxisLimit,
} from '@smarteverything/domain/home-map-edit-core';
import {
  NO_EDIT_OVERLAY,
  type EditEvent,
  type EditOverlay,
} from '../../../../components/house-map/3d/map-3d-edit-protocol';
import {
  boxOf,
  editFactsOf,
  editObjectOf,
  type SpecOf,
} from '../../../../components/house-map/edit/furniture-box';
import { objectOp } from '../../../../components/house-map/edit/ops';
import { placementOp } from '../list-editor/objects-devices-model';
import type { EditorNotice } from '../mount-edit';
import { selectMoveOps, type GizmoMode, type GizmoState } from '../tool-state';
import type { ActionTarget } from './object-actions';
import { selectionTarget } from './pick';

export const ROOM_SCALE_NOTICE = 'Change the room size with Width and Depth in the panel';

export const LOCK_BADGE_TEXT = 'Locked';

export function lockedNotice(name: string): string {
  return `${name} is locked. Unlock to move it.`;
}

type EditGizmo = NonNullable<EditOverlay['gizmo']>;

export interface HandlesInput {
  readonly floor: HomeMapFloor | null;
  readonly selectedId: string | null;
  readonly readOnly: boolean;
  readonly gizmo: GizmoState;
  readonly specOf: SpecOf;
  readonly nameOf: (id: string) => string;
}

export interface HandlesOverlay {
  readonly overlay: EditOverlay;
  readonly notice: EditorNotice | null;
}

const ALL_MODES: readonly GizmoMode[] = ['move', 'rotate', 'scale'];

function onWall(target: ActionTarget): boolean {
  if (target.kind === 'object') return target.object.wall !== undefined;
  return target.kind === 'device' && target.placement.mount === 'wall';
}

export function gizmoModes(target: ActionTarget | null): readonly GizmoMode[] {
  if (target === null || (target.kind === 'object' && target.object.locked)) return [];
  if (target.kind === 'room') return ['move', 'scale'];
  if (target.kind === 'device') return onWall(target) ? ['move'] : ['move', 'rotate'];
  return onWall(target) ? ['move', 'scale'] : ALL_MODES;
}

function axesOf(target: ActionTarget): EditGizmo['axes'] {
  if (onWall(target)) return ['x', 'z'];
  if (target.kind === 'object') return ['x', 'y', 'z'];
  return ['x', 'y'];
}

function roomCentre(room: HomeMapRoom): HomeMapVec {
  const ring = room.polygon.outer;
  const sum = ring.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), {
    x: 0,
    y: 0,
  });
  return { x: sum.x / Math.max(ring.length, 1), y: sum.y / Math.max(ring.length, 1) };
}

function poseOf(target: ActionTarget): EditGizmo['centre'] & { readonly turn: number } {
  if (target.kind === 'room') return { ...roomCentre(target.room), height: 0, turn: 0 };
  if (target.kind === 'object') {
    const { at, elevation, rotation } = target.object;
    return { x: at.x, y: at.y, height: elevation, turn: rotation };
  }
  const { at, height, rotation } = target.placement;
  return { x: at.x, y: at.y, height, turn: rotation };
}

function gizmoOf(target: ActionTarget, state: GizmoState): EditGizmo {
  const { turn, ...centre } = poseOf(target);
  return { mode: state.mode, space: state.space, centre, axes: axesOf(target), turn };
}

function lockedMarks(
  target: Extract<ActionTarget, { readonly kind: 'object' }>,
  specOf: SpecOf,
): Pick<EditOverlay, 'ghosts' | 'labels'> {
  const height = target.object.elevation;
  const corners = homeMapBoxCorners(boxOf(target.object, specOf)).map((corner) => ({
    ...corner,
    height,
  }));
  const [first] = corners;
  const ring = first === undefined ? corners : [...corners, first];
  const badge = corners.reduce(
    (best, corner) => (corner.x + corner.y > best.x + best.y ? corner : best),
    first ?? { ...target.object.at, height },
  );
  return {
    ghosts: [{ shape: 'polyline', points: ring, tone: 'neutral' }],
    labels: [{ at: badge, text: LOCK_BADGE_TEXT, tone: 'neutral' }],
  };
}

function noticeOf(input: HandlesInput, target: ActionTarget): EditorNotice | null {
  if (target.kind === 'object' && target.object.locked) {
    return { text: lockedNotice(input.nameOf(target.object.id)), tone: 'info' };
  }
  if (target.kind === 'room' && input.gizmo.mode === 'scale' && !input.readOnly) {
    return { text: ROOM_SCALE_NOTICE, tone: 'info' };
  }
  return null;
}

export function handlesOverlay(input: HandlesInput): HandlesOverlay {
  const target = input.floor === null ? null : selectionTarget(input.floor, input.selectedId);
  const base: EditOverlay = {
    ...NO_EDIT_OVERLAY,
    mode: 'select',
    selection: target === null || input.selectedId === null ? [] : [input.selectedId],
    snapping: input.gizmo.snapping,
    readOnly: input.readOnly,
  };
  if (target === null) return { overlay: base, notice: null };
  const notice = noticeOf(input, target);
  if (target.kind === 'object' && target.object.locked) {
    return { overlay: { ...base, ...lockedMarks(target, input.specOf) }, notice };
  }
  const gizmo = input.readOnly ? null : gizmoOf(target, input.gizmo);
  return { overlay: { ...base, gizmo }, notice };
}

export type GizmoEdit = Extract<
  EditEvent,
  { readonly type: 'move' | 'rotate' | 'resize' | 'room-move' }
>;

const GIZMO_EDITS: ReadonlySet<EditEvent['type']> = new Set([
  'move',
  'rotate',
  'resize',
  'room-move',
]);

export function isGizmoEdit(event: EditEvent): event is GizmoEdit {
  return GIZMO_EDITS.has(event.type);
}

type RotateEdit = Extract<EditEvent, { readonly type: 'rotate' }>;

type ResizeEdit = Extract<EditEvent, { readonly type: 'resize' }>;

function rotateOps(floor: HomeMapFloor, event: RotateEdit): readonly HomeMapOp[] {
  const object = floor.objects.find((item) => item.id === event.id);
  if (object !== undefined) {
    return object.locked ? [] : [objectOp(floor.id, object.id, { rotation: event.degrees })];
  }
  return floor.placements.some((item) => item.deviceId === event.id)
    ? [placementOp(floor.id, event.id, { rotation: event.degrees, auto: false })]
    : [];
}

function heightParams(
  limit: HomeMapEditAxisLimit | null,
  height: number | null,
): Readonly<Record<string, number>> {
  if (limit === null || height === null) return {};
  return { [limit.name]: homeMapEditInner(limit, homeMapEditClamp(height, limit.min, limit.max)) };
}

function resizeOps(floor: HomeMapFloor, specOf: SpecOf, event: ResizeEdit): readonly HomeMapOp[] {
  const object = floor.objects.find((item) => item.id === event.id);
  if (object === undefined || object.locked) return [];
  const spec = specOf(object.modelId);
  const facts = editFactsOf(spec);
  const edit = editObjectOf(object, spec);
  const before = homeMapObjectBox(edit, facts);
  const limits = homeMapEditLimits(facts);
  const { box } = event;
  const made = homeMapEditBuild(edit, facts, before, {
    at: box.at,
    rotation: box.rotation,
    sizes: {
      d: homeMapEditFit(box.d, limits.d, before.d),
      w: homeMapEditFit(box.w, limits.w, before.w),
    },
    extra: heightParams(limits.h, box.h),
    labels: [],
    preset: null,
  });
  const at = { x: made.box.at.x, y: made.box.at.y };
  return [objectOp(floor.id, object.id, { at, rotation: made.box.rotation, params: made.params })];
}

export function gizmoEditOps(
  floor: HomeMapFloor,
  specOf: SpecOf,
  event: GizmoEdit,
): readonly HomeMapOp[] {
  switch (event.type) {
    case 'move':
      return selectMoveOps(floor, event);
    case 'rotate':
      return rotateOps(floor, event);
    case 'resize':
      return resizeOps(floor, specOf, event);
    case 'room-move':
      return floor.rooms.some((room) => room.id === event.id)
        ? [
            {
              op: 'move',
              kind: 'room',
              floorId: floor.id,
              id: event.id,
              dx: event.by.x,
              dy: event.by.y,
            },
          ]
        : [];
  }
}
