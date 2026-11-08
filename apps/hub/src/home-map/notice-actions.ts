import {
  ApiError,
  HOME_MAP_ROOM_WRITE,
  type HOME_MAP_NOTICE_ACTIONS,
  type HomeMap,
  type HomeMapFloor,
  type HomeMapNotice,
  type HomeMapOp,
  type HomeMapRoom,
} from '@smarteverything/domain';
import { matchRooms } from './merge/match';
import type { RectifiedRoom } from './merge/rectify';
import { floorMaterialOfCode } from './merge/reimport-rooms';

export type NoticeAction = (typeof HOME_MAP_NOTICE_ACTIONS)[number];

export interface NoticeInput {
  readonly map: HomeMap;
  readonly notice: HomeMapNotice;
  readonly action: NoticeAction;
  readonly robotRooms: () => readonly RectifiedRoom[];
  readonly newId: () => string;
}

interface Held {
  readonly floor: HomeMapFloor;
  readonly room: HomeMapRoom;
}

const COLOUR_SLOTS = 8;

const refused = (notice: HomeMapNotice, action: NoticeAction, hint: string): ApiError =>
  new ApiError('invalid_request', `${action} does not apply to a ${notice.kind} notice. ${hint}`);

const heldRoom = (map: HomeMap, roomId: string): Held | null => {
  for (const floor of map.floors) {
    const room = floor.rooms.find((entry) => entry.id === roomId);
    if (room !== undefined) return { floor, room };
  }
  return null;
};

const dismiss = (notice: HomeMapNotice): HomeMapOp => ({
  op: 'remove',
  kind: 'notice',
  id: notice.id,
});

const dropRoom = ({ floor, room }: Held): HomeMapOp => ({
  op: 'remove',
  kind: 'room',
  floorId: floor.id,
  id: room.id,
});

function missingOps(notice: HomeMapNotice, action: NoticeAction, held: Held | null): HomeMapOp[] {
  if (held === null) return [dismiss(notice)];
  if (action === 'keep_mine') {
    const patch = { origin: { kind: 'hand' } };
    return [
      { op: 'update', kind: 'room', floorId: held.floor.id, id: held.room.id, patch },
      dismiss(notice),
    ];
  }
  if (action === 'split_like_source') {
    throw refused(notice, action, 'The robot did not split this room, it removed it.');
  }
  return [dropRoom(held), dismiss(notice)];
}

function partRoom(held: Held, part: RectifiedRoom, index: number, newId: () => string): HomeMapOp {
  const { origin } = held.room;
  const element = HOME_MAP_ROOM_WRITE.parse({
    id: newId(),
    name: part.name,
    homeRoomId: null,
    polygon: part.polygon,
    labelAt: part.labelAt,
    colourSlot: ((held.floor.rooms.length + index) % COLOUR_SLOTS) + 1,
    floorMaterial: floorMaterialOfCode(part.floorCode),
    wallPaint: null,
    ceilingHeight: null,
    origin:
      origin.kind === 'source'
        ? { kind: 'source', sourceId: origin.sourceId, ref: part.ref, overridden: [] }
        : { kind: 'hand' },
  });
  return { op: 'add', kind: 'room', floorId: held.floor.id, element };
}

function splitOps(
  input: NoticeInput,
  held: Held,
  parts: readonly RectifiedRoom[],
): readonly HomeMapOp[] {
  const adds = parts.map((part, index) => partRoom(held, part, index, input.newId));
  return [dropRoom(held), ...adds, dismiss(input.notice)];
}

function robotShapeOps(input: NoticeInput, held: Held, robot: RectifiedRoom): readonly HomeMapOp[] {
  const { origin } = held.room;
  const overridden = origin.kind === 'source' ? origin.overridden : [];
  const patch = {
    polygon: robot.polygon,
    ...(overridden.includes('labelAt') ? {} : { labelAt: robot.labelAt }),
    ...(origin.kind === 'source'
      ? {
          origin: {
            ...origin,
            ref: robot.ref,
            overridden: overridden.filter((key) => key !== 'polygon'),
          },
        }
      : {}),
  };
  return [
    { op: 'update', kind: 'room', floorId: held.floor.id, id: held.room.id, patch },
    dismiss(input.notice),
  ];
}

interface RobotView {
  readonly parts: readonly RectifiedRoom[];
  readonly bound: RectifiedRoom | undefined;
}

function robotView(input: NoticeInput, held: Held): RobotView {
  const { origin } = held.room;
  const source =
    origin.kind === 'source'
      ? input.map.sources.find((entry) => entry.id === origin.sourceId)
      : undefined;
  const ref = origin.kind === 'source' ? origin.ref : held.room.id;
  const baseRoom = source?.base.rooms.find((entry) => entry.ref === ref);
  const rooms = input.robotRooms();
  const matching = matchRooms(
    [{ id: held.room.id, ref, polygon: baseRoom?.polygon ?? held.room.polygon }],
    rooms.map((room) => ({ ref: room.ref, polygon: room.polygon })),
  );
  const byRef = new Map(rooms.map((room) => [room.ref, room]));
  return {
    parts: (matching.splits.get(held.room.id) ?? []).flatMap((part) => byRef.get(part) ?? []),
    bound: byRef.get(matching.bound.get(held.room.id) ?? ''),
  };
}

function changedOps(input: NoticeInput, held: Held | null): readonly HomeMapOp[] {
  const { notice, action } = input;
  if (held === null || action === 'keep_mine') return [dismiss(notice)];
  if (action === 'delete') return [dropRoom(held), dismiss(notice)];
  const view = robotView(input, held);
  if (action === 'split_like_source') {
    if (view.parts.length < 2) throw refused(notice, action, 'The robot has not split this room.');
    return splitOps(input, held, view.parts);
  }
  if (view.bound === undefined) {
    throw refused(notice, action, 'The robot split this room: use split_like_source.');
  }
  return robotShapeOps(input, held, view.bound);
}

export function noticeOps(input: NoticeInput): readonly HomeMapOp[] {
  const { notice, action } = input;
  switch (notice.kind) {
    case 'source_moved':
    case 'link_stale':
    case 'source_new_robot_map':
      if (action === 'keep_mine' || action === 'delete') return [dismiss(notice)];
      throw refused(notice, action, 'Dismiss it, or align the map with two points.');
    case 'source_missing':
      return missingOps(notice, action, heldRoom(input.map, notice.elementId));
    case 'source_changed':
      return changedOps(input, heldRoom(input.map, notice.elementId));
  }
}
