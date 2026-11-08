import { randomUUID } from 'expo-crypto';
import { useState } from 'react';
import {
  API_ENDPOINTS as E,
  type HomeMap,
  type HomeMapOp,
  type HomeMapRoom,
  type HomeMapVec,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { api } from '../../../../api/transport';
import type { HomeMapEditing } from '../../data/home-map-query';
import { roomNameOp } from '../list-editor/rooms-walls-model';
import { drawFloorOf } from './rooms-draw';
import type { DrawFloor } from './rooms-draw-model';
import type { SizeAxis } from './rooms-edit-geometry';
import {
  IDLE_EDIT,
  addCorner,
  linkAction,
  mergeRooms,
  moveCornerOp,
  moveRoomOp,
  pushSideOp,
  removeCornerOp,
  resizeRoomOp,
  splitRoom,
  type CutLine,
  type EditStep,
  type LinkAction,
  type RoomsEditMode,
  type RoomsEditRefusal,
} from './rooms-edit-model';

export const LINK_FAILED_TEXT = 'The home room did not change. Try again.';

export const NO_ROBOT_TEXT = 'The robot that drew this room is gone, so its link cannot change.';

export interface RoomsEdit {
  readonly mode: RoomsEditMode;
  readonly refusal: RoomsEditRefusal | null;
  readonly linkNote: string | null;
  readonly floor: DrawFloor | null;
  readonly room: HomeMapRoom | null;
  readonly corner: number | null;
  readonly readOnly: boolean;
  readonly start: (kind: 'split' | 'merge') => void;
  readonly cancel: () => void;
  readonly line: (line: CutLine) => void;
  readonly cut: () => void;
  readonly merge: (otherId: string) => void;
  readonly link: (homeRoomId: string | null) => void;
  readonly rename: (name: string) => void;
  readonly pickCorner: (index: number | null) => void;
  readonly setCorner: (index: number, point: HomeMapVec) => void;
  readonly removeCorner: () => void;
  readonly addCorner: (side: number) => void;
  readonly pushSide: (side: number, offset: number) => void;
  readonly resize: (axis: SizeAxis, size: number) => void;
  readonly moveRoom: (by: HomeMapVec) => void;
}

export interface RoomsEditInput {
  readonly map: HomeMap;
  readonly floorId: string | null;
  readonly editing: HomeMapEditing;
  readonly readOnly: boolean;
  readonly selected: string | null;
  readonly onSelect: (id: string) => void;
}

function vacuumLink(action: Extract<LinkAction, { kind: 'vacuum' }>): Promise<unknown> {
  const params = { deviceId: action.deviceId, mapRoomId: action.mapRoomId };
  return action.roomId === null
    ? api().call(E.removeVacuumRoomLink, { params })
    : api().call(E.setVacuumRoomLink, { params, body: { roomId: action.roomId, move: false } });
}

interface CornerPick {
  readonly roomId: string;
  readonly index: number;
}

interface EditState {
  readonly mode: RoomsEditMode;
  readonly refusal: RoomsEditRefusal | null;
  readonly linkNote: string | null;
  readonly corner: CornerPick | null;
}

const IDLE_STATE: EditState = { mode: IDLE_EDIT, refusal: null, linkNote: null, corner: null };

function linkerOf(
  input: RoomsEditInput,
  room: HomeMapRoom | null,
  setNote: (note: string | null) => void,
): (homeRoomId: string | null) => void {
  return (homeRoomId) => {
    if (room === null || input.floorId === null || input.readOnly) return;
    const action = linkAction(input.map, input.floorId, room, homeRoomId);
    setNote(null);
    if (action.kind === 'no_robot') setNote(NO_ROBOT_TEXT);
    if (action.kind === 'op')
      background(input.editing.edit([action.op]), 'home_map.room_link_failed');
    if (action.kind !== 'vacuum') return;
    const job = vacuumLink(action);
    background(job, 'home_map.room_link_failed');
    job.then(undefined, () => {
      setNote(LINK_FAILED_TEXT);
    });
  };
}

interface EditCore {
  readonly input: RoomsEditInput;
  readonly floor: DrawFloor | null;
  readonly room: HomeMapRoom | null;
  readonly mode: RoomsEditMode;
  readonly corner: number | null;
  readonly setState: (next: (previous: EditState) => EditState) => void;
}

function runStep(core: EditCore, step: EditStep): void {
  if (step.kind === 'refused') {
    core.setState((previous) => ({ ...previous, refusal: step.reason }));
    return;
  }
  core.setState(() => IDLE_STATE);
  background(core.input.editing.edit(step.ops), 'home_map.rooms_edit_failed');
  core.input.onSelect(step.select);
}

function startMode(core: EditCore, kind: 'split' | 'merge'): void {
  const { room } = core;
  if (room === null || core.input.readOnly) return;
  const mode: RoomsEditMode =
    kind === 'split' ? { kind, roomId: room.id, line: null } : { kind, roomId: room.id };
  core.setState(() => ({ ...IDLE_STATE, mode }));
}

function renameRoom(core: EditCore, name: string): void {
  const { room, floor } = core;
  if (room === null || floor === null || core.input.readOnly) return;
  const op = roomNameOp(floor.id, room, name);
  if (op !== null) background(core.input.editing.edit([op]), 'home_map.rooms_edit_failed');
}

function pick(core: EditCore, index: number | null): void {
  const { room } = core;
  core.setState((previous) => ({
    ...previous,
    corner: room === null || index === null ? null : { roomId: room.id, index },
  }));
}

type OpBuild = (floorId: string, room: HomeMapRoom) => HomeMapOp | null;

function send(core: EditCore, build: OpBuild): boolean {
  const { room, floor } = core;
  if (room === null || floor === null || core.input.readOnly) return false;
  const op = build(floor.id, room);
  if (op === null) return false;
  background(core.input.editing.edit([op]), 'home_map.rooms_edit_failed');
  return true;
}

type ShapeActions = Pick<
  RoomsEdit,
  'pickCorner' | 'setCorner' | 'removeCorner' | 'addCorner' | 'pushSide' | 'resize' | 'moveRoom'
>;

function shapeActions(core: EditCore): ShapeActions {
  return {
    pickCorner: (index): void => {
      pick(core, index);
    },
    setCorner: (index, point): void => {
      send(core, (floorId, room) => moveCornerOp(floorId, room, index, point));
    },
    removeCorner: (): void => {
      const { corner } = core;
      if (corner === null) return;
      if (send(core, (floorId, room) => removeCornerOp(floorId, room, corner))) pick(core, null);
    },
    addCorner: (side): void => {
      const { room, floor } = core;
      const made = room === null || floor === null ? null : addCorner(floor.id, room, side);
      if (made !== null && send(core, () => made.op)) pick(core, made.corner);
    },
    pushSide: (side, offset): void => {
      send(core, (floorId, room) => pushSideOp(floorId, room, side, offset));
    },
    resize: (axis, size): void => {
      send(core, (floorId, room) => resizeRoomOp(floorId, room, axis, size));
    },
    moveRoom: (by): void => {
      send(core, (floorId, room) => moveRoomOp(floorId, room.id, by));
    },
  };
}

type ModeActions = Pick<RoomsEdit, 'start' | 'cancel' | 'line' | 'cut' | 'merge' | 'rename'>;

function modeActions(core: EditCore): ModeActions {
  const { mode, floor, setState } = core;
  return {
    start: (kind): void => {
      startMode(core, kind);
    },
    cancel: (): void => {
      setState(() => IDLE_STATE);
    },
    line: (line): void => {
      if (mode.kind !== 'split') return;
      setState((previous) => ({ ...previous, refusal: null, mode: { ...mode, line } }));
    },
    cut: (): void => {
      if (mode.kind !== 'split' || mode.line === null || floor === null) return;
      runStep(
        core,
        splitRoom(floor, mode.roomId, mode.line, () => randomUUID()),
      );
    },
    merge: (otherId): void => {
      if (mode.kind === 'merge' && floor !== null)
        runStep(core, mergeRooms(floor, mode.roomId, otherId));
    },
    rename: (name): void => {
      renameRoom(core, name);
    },
  };
}

function liveCorner(state: EditState, room: HomeMapRoom | null): number | null {
  const picked = state.corner;
  if (room === null || picked?.roomId !== room.id) return null;
  return picked.index < room.polygon.outer.length ? picked.index : null;
}

export function useRoomsEdit(input: RoomsEditInput): RoomsEdit {
  const [state, setState] = useState<EditState>(IDLE_STATE);
  const floor = drawFloorOf(input.map, input.floorId);
  const room = floor?.rooms.find((item) => item.id === input.selected) ?? null;
  const live = room !== null && state.mode.kind !== 'idle' && state.mode.roomId === room.id;
  const mode = live ? state.mode : IDLE_EDIT;
  const corner = mode.kind === 'idle' ? liveCorner(state, room) : null;
  const core: EditCore = { input, floor, room, mode, corner, setState };
  return {
    ...{ mode, floor, room, corner, readOnly: input.readOnly },
    refusal: live ? state.refusal : null,
    linkNote: state.linkNote,
    ...modeActions(core),
    ...shapeActions(core),
    link: linkerOf(input, room, (linkNote) => {
      setState((previous) => ({ ...previous, linkNote }));
    }),
  };
}
