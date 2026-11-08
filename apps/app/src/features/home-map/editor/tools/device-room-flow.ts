import { useState } from 'react';
import {
  HOME_MAP_GRID_M,
  type HomeMapFloor,
  type HomeMapOp,
  type HomeMapVec,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useDevices, useRooms } from '../../../../store/selectors';
import type { HomeMapEditing } from '../../data/home-map-query';
import { nearestFreeSpot } from '../manipulate/object-actions';
import {
  CALM,
  droppedPlacement,
  keepRoom,
  moveRoom,
  noted,
  placementOfDevice,
  placementOps,
  roomMoveOf,
  savedNote,
  undoRoom,
  type DevicesInput,
  type Flow,
  type RoomMove,
} from './devices-model';
import { NO_SPOT_TEXT } from './furniture-model';

export interface RoomFlowRow extends Flow {
  readonly readOnly: boolean;
  readonly confirmMove: () => void;
  readonly keep: () => void;
  readonly undoMove: () => void;
  readonly dismiss: () => void;
}

export type PlaceHow = 'ask' | 'move';

export interface DeviceRoomFlow extends RoomFlowRow {
  readonly place: (deviceId: string, at: HomeMapVec, how: PlaceHow) => void;
  readonly moveTo: (deviceId: string, roomId: string) => void;
  readonly apply: (ops: readonly HomeMapOp[]) => void;
  readonly run: (job: Promise<Flow>, event: string) => void;
  readonly show: (flow: Flow) => void;
}

interface Placing {
  readonly input: RoomFlowInput;
  readonly devices: ReturnType<typeof useDevices>;
  readonly rooms: ReturnType<typeof useRooms>;
  readonly apply: (ops: readonly HomeMapOp[]) => void;
  readonly confirm: (move: RoomMove) => void;
  readonly ask: (move: RoomMove) => void;
}

function placer({ input, devices, rooms, apply, confirm, ask }: Placing): DeviceRoomFlow['place'] {
  return (deviceId, at, how) => {
    const floor = input.map.floors.find((each) => each.id === input.floorId);
    const device = devices.find((each) => each.id === deviceId);
    if (floor === undefined || device === undefined || input.readOnly) return;
    const base = placementOfDevice(input.map, deviceId);
    const next = droppedPlacement(floor, deviceId, base, at);
    const ops = placementOps(base, next);
    const change = roomMoveOf(floor, device, next.at, rooms);
    input.onSelect(deviceId);
    if (change === null) {
      apply(ops);
      return;
    }
    const undo = placementOps(next, base);
    const move: RoomMove = { ...change, ops, undo, fresh: base === null, at: next.at };
    if (how === 'move') confirm(move);
    else ask(move);
  };
}

export function roomSpot(floor: Pick<HomeMapFloor, 'rooms'>, roomId: string): HomeMapVec | null {
  const room = floor.rooms.find((each) => each.id === roomId);
  if (room === undefined) return null;
  const origin = room.labelAt;
  const box = { at: origin, rotation: 0, w: HOME_MAP_GRID_M, d: HOME_MAP_GRID_M };
  return nearestFreeSpot({ box, origin, room, others: [] }, true);
}

function mover(
  input: RoomFlowInput,
  place: DeviceRoomFlow['place'],
  show: (flow: Flow) => void,
): DeviceRoomFlow['moveTo'] {
  return (deviceId, roomId) => {
    const floor = input.map.floors.find((each) => each.id === input.floorId);
    if (floor === undefined || input.readOnly) return;
    const at = roomSpot(floor, roomId);
    if (at === null) show(noted(NO_SPOT_TEXT));
    else place(deviceId, at, 'move');
  };
}

export interface RoomFlowInput extends Pick<
  DevicesInput,
  'map' | 'floorId' | 'readOnly' | 'onSelect'
> {
  readonly editing: Pick<HomeMapEditing, 'edit'>;
}

export function useDeviceRoomFlow(input: RoomFlowInput): DeviceRoomFlow {
  const devices = useDevices();
  const rooms = useRooms();
  const [flow, setFlow] = useState<Flow>(CALM);
  const run = (job: Promise<Flow>, event: string): void => {
    background(job.then(setFlow), event);
  };
  const apply = (ops: readonly HomeMapOp[]): void => {
    run(savedNote(input.editing.edit(ops)), 'home_map.device_edit_failed');
  };
  const confirm = (move: RoomMove): void => {
    run(moveRoom(input.editing, move), 'home_map.move_failed');
  };
  const ask = (move: RoomMove): void => {
    setFlow({ ...CALM, pending: move });
  };
  const place = placer({ input, devices, rooms, apply, confirm, ask });
  return {
    ...flow,
    readOnly: input.readOnly,
    place,
    moveTo: mover(input, place, setFlow),
    apply,
    run,
    show: setFlow,
    confirmMove: (): void => {
      if (flow.pending !== null) confirm(flow.pending);
    },
    keep: (): void => {
      if (flow.pending !== null) run(keepRoom(input.map, flow.pending), 'home_map.keep_failed');
    },
    undoMove: (): void => {
      if (flow.moved !== null) run(undoRoom(input.editing, flow.moved), 'home_map.undo_failed');
    },
    dismiss: (): void => {
      setFlow(CALM);
    },
  };
}
