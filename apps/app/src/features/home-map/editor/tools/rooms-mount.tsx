import type { ReactNode } from 'react';
import { homeMapDistance, homeMapRoomAt, type HomeMapRoom } from '@smarteverything/domain';
import {
  NO_EDIT_OVERLAY,
  type EditEvent,
  type EditOverlay,
} from '../../../../components/house-map/3d/map-3d-edit-protocol';
import { useIsPhone } from '../../../../design/size-class';
import { selectionTick } from '../../../../platform/haptics';
import { useRooms } from '../../../../store/selectors';
import {
  NO_EDIT_FIELDS,
  type EditorNotice,
  type MountArgs,
  type MountEditFields,
} from '../mount-edit';
import { RoomsNudge } from '../precision/nudge';
import {
  RoomsDrawPanel,
  roomsDrawEdit,
  roomsDrawNotice,
  roomsDraftOpen,
  roomsDrawOverlay,
  roomsDrawing,
  useRoomsDraw,
  type RoomsDraw,
  type RoomsDrawInput,
} from './rooms-draw';
import { DEFAULT_DRAW_GRID_M, hitRadiusM } from './rooms-draw-model';
import { useRoomsEdit, type RoomsEdit } from './rooms-edit';
import { handleNear, roomHandles, roomMarks } from './rooms-edit-geometry';
import { mergeCandidates, snapCut, type CutLine } from './rooms-edit-model';
import { RoomsEditPanel } from './rooms-edit-panel';

export const CUT_LINE_ID = 'room-cut';

export const EDIT_HINTS = {
  room: 'Drag a corner or a side, or tap a side dot to add a corner',
  corner: 'Drag the corner, or remove it in the panel',
  split: 'Tap one side of the room, then the other',
  splitNext: 'Tap the other side of the room',
  merge: 'Tap a highlighted room next to this one',
} as const;

export interface RoomsMount extends MountEditFields {
  readonly panel: ReactNode;
}

export type MountRooms = (args: MountArgs) => RoomsMount;

type EditHandle = EditOverlay['handles'][number];

const onePoint = (line: CutLine): boolean => homeMapDistance(line.from, line.to) === 0;

function cutHandle(line: CutLine, end: 'from' | 'to'): EditHandle {
  const at = line[end];
  return {
    id: `${CUT_LINE_ID}:${end}`,
    kind: 'point',
    at: { x: at.x, y: at.y, height: 0 },
    surface: { kind: 'ground' },
    target: { kind: 'line-end', lineId: CUT_LINE_ID, end },
  };
}

function splitOverlay(edit: RoomsEdit, room: HomeMapRoom, line: CutLine | null): EditOverlay {
  const base = { ...NO_EDIT_OVERLAY, mode: 'draw-points' as const, selection: [room.id] };
  if (line === null) return { ...base, readOnly: edit.readOnly };
  const ends = onePoint(line)
    ? [cutHandle(line, 'to')]
    : [cutHandle(line, 'from'), cutHandle(line, 'to')];
  const points = [line.from, line.to].map((point) => ({ ...point, height: 0 }));
  return {
    ...base,
    handles: ends,
    shapes: [{ kind: 'line', id: CUT_LINE_ID, from: line.from, to: line.to }],
    ghosts: onePoint(line) ? [] : [{ shape: 'polyline', points, tone: 'accent' }],
    readOnly: edit.readOnly,
  };
}

function mergeOverlay(edit: RoomsEdit, room: HomeMapRoom): EditOverlay {
  const others = edit.floor === null ? [] : mergeCandidates(edit.floor, room.id);
  return {
    ...NO_EDIT_OVERLAY,
    selection: [room.id],
    ghosts: others.map((other) => ({
      shape: 'polygon',
      points: other.polygon.outer.map((point) => ({ x: point.x, y: point.y, height: 0 })),
      tone: 'accent',
    })),
    readOnly: edit.readOnly,
  };
}

export function roomsEditOverlay(edit: RoomsEdit): EditOverlay | null {
  const { room, mode } = edit;
  if (room === null) return null;
  if (mode.kind === 'split') return splitOverlay(edit, room, mode.line);
  if (mode.kind === 'merge') return mergeOverlay(edit, room);
  const marks = roomMarks(room, edit.corner);
  return {
    ...NO_EDIT_OVERLAY,
    mode: 'select',
    selection: [room.id],
    roomDrag: !edit.readOnly,
    handles: roomHandles(room).map((each) => each.handle),
    ghosts: [...marks.ghosts],
    labels: [...marks.labels],
    readOnly: edit.readOnly,
  };
}

type TapEvent = Extract<EditEvent, { readonly type: 'tap' }>;

function tapCut(edit: RoomsEdit, line: CutLine | null, event: TapEvent): void {
  if (edit.floor === null || edit.readOnly) return;
  const anchor = line !== null && onePoint(line) ? line.from : null;
  const snap = { radiusM: hitRadiusM(event.metresPerPx), gridM: DEFAULT_DRAW_GRID_M };
  const point = snapCut(edit.floor, event.point, anchor, snap);
  selectionTick();
  edit.line(anchor === null ? { from: point, to: point } : { from: anchor, to: point });
}

function tapMerge(edit: RoomsEdit, room: HomeMapRoom, event: TapEvent): void {
  if (edit.floor === null || edit.readOnly) return;
  const others = mergeCandidates(edit.floor, room.id);
  const id = event.hit.kind === 'room' ? event.hit.id : homeMapRoomAt(others, event.point)?.id;
  if (id === undefined || !others.some((other) => other.id === id)) return;
  selectionTick();
  edit.merge(id);
}

function tapHandle(edit: RoomsEdit, room: HomeMapRoom, event: TapEvent): boolean {
  const radius = hitRadiusM(event.metresPerPx);
  const hit = edit.readOnly ? null : handleNear(roomHandles(room), event.point, radius);
  if (hit === null) {
    edit.pickCorner(null);
    return false;
  }
  selectionTick();
  if (hit.kind === 'corner') edit.pickCorner(hit.index);
  else edit.addCorner(hit.index);
  return true;
}

function onTap(edit: RoomsEdit, room: HomeMapRoom, event: TapEvent): boolean {
  const { mode } = edit;
  if (mode.kind === 'split') tapCut(edit, mode.line, event);
  else if (mode.kind === 'merge') tapMerge(edit, room, event);
  else return tapHandle(edit, room, event);
  return true;
}

type VertexEvent = Extract<EditEvent, { readonly type: 'vertex' }>;

function onVertex(edit: RoomsEdit, room: HomeMapRoom, event: VertexEvent): void {
  const { mode } = edit;
  if (mode.kind === 'split' && mode.line !== null) {
    const { line } = mode;
    const from = !onePoint(line) && event.handleId === cutHandle(line, 'from').id;
    edit.line(from ? { from: event.point, to: line.to } : { from: line.from, to: event.point });
    return;
  }
  const corner = roomHandles(room).find((each) => each.handle.id === event.handleId);
  if (mode.kind === 'idle' && corner?.kind === 'corner') edit.setCorner(corner.index, event.point);
}

type EdgeEvent = Extract<EditEvent, { readonly type: 'edge' }>;

function onEdge(edit: RoomsEdit, room: HomeMapRoom, event: EdgeEvent): void {
  const side = roomHandles(room).find((each) => each.handle.id === event.handleId);
  if (edit.mode.kind === 'idle' && side?.kind === 'side') edit.pushSide(side.index, event.offset);
}

type RoomMoveEvent = Extract<EditEvent, { readonly type: 'room-move' }>;

function onRoomMove(edit: RoomsEdit, room: HomeMapRoom, event: RoomMoveEvent): void {
  if (event.id === room.id && edit.mode.kind === 'idle') edit.moveRoom(event.by);
}

export function roomsEditEvent(edit: RoomsEdit, event: EditEvent): boolean {
  const { room } = edit;
  if (room === null) return false;
  if (event.type === 'tap') return onTap(edit, room, event);
  if (event.type === 'vertex') onVertex(edit, room, event);
  else if (event.type === 'edge') onEdge(edit, room, event);
  else if (event.type === 'room-move') onRoomMove(edit, room, event);
  else if (event.type === 'snap' && event.engaged) selectionTick();
  return true;
}

function hintOf(edit: RoomsEdit): string {
  const { mode } = edit;
  if (mode.kind === 'merge') return EDIT_HINTS.merge;
  if (mode.kind === 'split') return mode.line === null ? EDIT_HINTS.split : EDIT_HINTS.splitNext;
  return edit.corner === null ? EDIT_HINTS.room : EDIT_HINTS.corner;
}

export function roomsEditNotice(edit: RoomsEdit): EditorNotice | null {
  return edit.readOnly || edit.room === null ? null : { text: hintOf(edit), tone: 'info' };
}

export function roomsEditing(edit: RoomsEdit, draw: RoomsDraw): boolean {
  return edit.room !== null && (edit.mode.kind !== 'idle' || !roomsDrawing(draw));
}

export function useRoomsMount(input: RoomsDrawInput): MountRooms {
  const draw = useRoomsDraw(input);
  const edit = useRoomsEdit(input);
  const hubRooms = useRooms();
  const framed = useIsPhone();
  const editPanel = <RoomsEditPanel edit={edit} hubRooms={hubRooms} />;
  return ({ floor }) => {
    const panel =
      edit.mode.kind !== 'idle' ? (
        editPanel
      ) : (
        <>
          {editPanel}
          <RoomsNudge draw={draw} />
          <RoomsDrawPanel draw={draw} />
        </>
      );
    if (!roomsEditing(edit, draw)) {
      return {
        ...NO_EDIT_FIELDS,
        overlay: roomsDrawOverlay(draw, { floor, framed }),
        onEdit: (event): void => {
          roomsDrawEdit(draw, event);
        },
        notice: roomsDrawNotice(draw),
        draft: roomsDraftOpen(draw),
        panel,
      };
    }
    return {
      ...NO_EDIT_FIELDS,
      overlay: roomsEditOverlay(edit),
      onEdit: (event): void => {
        if (!roomsEditEvent(edit, event)) roomsDrawEdit(draw, event);
      },
      notice: roomsEditNotice(edit),
      draft: edit.mode.kind !== 'idle',
      panel,
    };
  };
}
