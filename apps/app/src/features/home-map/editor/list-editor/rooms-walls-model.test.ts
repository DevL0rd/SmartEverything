import { describe, expect, it } from 'vitest';
import {
  HOME_MAP_ROOM_WRITE,
  HOME_MAP_WRITE,
  applyHomeMapEdits,
  type HomeMap,
  type HomeMapFloor,
  type HomeMapOp,
  type HomeMapRoom,
} from '@smarteverything/domain';
import {
  addCornerOp,
  checkedOps,
  cornerOp,
  linkableRooms,
  newRoom,
  newWall,
  removeCornerOp,
  roomLinkNote,
  roomLinkOp,
  roomNameOp,
  roomRect,
  roomRectOp,
  roomTitle,
  UNLINKED_TEXT,
  wallEndOp,
  wallLengthOp,
  wallUpdate,
} from './rooms-walls-model';

const FLOOR_ID = '00000000-0000-4000-8000-0000000000f1';
const HUB_A = '00000000-0000-4000-8000-0000000000a1';
const HUB_B = '00000000-0000-4000-8000-0000000000b1';
const ACTOR = 'profile:tester';

function roomOf(
  id: string,
  outer: readonly { x: number; y: number }[],
  homeRoomId: string | null,
): HomeMapRoom {
  return HOME_MAP_ROOM_WRITE.parse({
    id,
    name: null,
    homeRoomId,
    polygon: { outer, holes: [] },
    labelAt: { x: 1, y: 1 },
    colourSlot: 1,
    floorMaterial: { kind: 'plain', variant: null, tint: null },
    wallPaint: null,
    ceilingHeight: null,
    origin: { kind: 'hand' },
  });
}

const RECT = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 3 },
  { x: 0, y: 3 },
];

const L_SHAPE = [
  { x: 5, y: 0 },
  { x: 8, y: 0 },
  { x: 8, y: 2 },
  { x: 7, y: 2 },
  { x: 7, y: 4 },
  { x: 5, y: 4 },
];

const MAP: HomeMap = HOME_MAP_WRITE.parse({
  schemaVersion: 1,
  id: 'home',
  name: 'Test house',
  revision: 1,
  updatedAt: '2026-10-25T00:00:00.000Z',
  north: 0,
  floors: [
    {
      id: FLOOR_ID,
      name: 'Ground',
      level: 0,
      elevation: 0,
      rooms: [roomOf('room-rect', RECT, HUB_A), roomOf('room-l', L_SHAPE, null)],
      walls: [
        {
          id: 'wall-1',
          from: { x: 0, y: 0 },
          to: { x: 4, y: 0 },
          thickness: 0.1,
          height: null,
          kind: 'solid',
          origin: { kind: 'hand' },
        },
      ],
      openings: [],
      objects: [],
      placements: [],
      annotations: [],
    },
  ],
  sources: [],
  notices: [],
});

function floor(): HomeMapFloor {
  const first = MAP.floors[0];
  if (first === undefined) throw new Error('fixture has no floor');
  return first;
}

function room(id: string): HomeMapRoom {
  const found = floor().rooms.find((item) => item.id === id);
  if (found === undefined) throw new Error(`no room ${id}`);
  return found;
}

function applied(ops: readonly (HomeMapOp | null)[]): HomeMap {
  const real = ops.filter((op): op is HomeMapOp => op !== null);
  const result = applyHomeMapEdits(MAP, real, { actor: ACTOR, at: '2026-10-25T00:00:00.000Z' });
  expect(result.conflicts).toEqual([]);
  return result.map;
}

function outerOf(map: HomeMap, id: string): readonly { x: number; y: number }[] {
  return map.floors[0]?.rooms.find((item) => item.id === id)?.polygon.outer ?? [];
}

describe('room size fields', () => {
  it('reads width and length for a rectangle and a corner table for other shapes', () => {
    expect(roomRect(RECT)).toEqual({ x: 0, y: 0, width: 4, length: 3 });
    expect(roomRect(L_SHAPE)).toBeNull();
  });

  it('resizes a rectangle from its top left corner', () => {
    const op = roomRectOp(FLOOR_ID, room('room-rect'), { x: 1, y: 1, width: 5, length: 2 });
    expect(roomRect(outerOf(applied([op]), 'room-rect'))).toEqual({
      x: 1,
      y: 1,
      width: 5,
      length: 2,
    });
  });

  it('refuses a zero width and a self crossing corner', () => {
    expect(roomRectOp(FLOOR_ID, room('room-rect'), { x: 0, y: 0, width: 0, length: 3 })).toBeNull();
    expect(cornerOp(FLOOR_ID, room('room-rect'), 1, { x: 2, y: 5 })).toBeNull();
  });

  it('adds a corner at the middle of an edge and removes corners down to three', () => {
    const added = outerOf(applied([addCornerOp(FLOOR_ID, room('room-rect'), 0)]), 'room-rect');
    expect(added).toHaveLength(5);
    expect(added[1]).toEqual({ x: 2, y: 0 });
    const removed = outerOf(applied([removeCornerOp(FLOOR_ID, room('room-l'), 3)]), 'room-l');
    expect(removed).toHaveLength(5);
    const triangle = roomOf('t', RECT.slice(0, 3), null);
    expect(removeCornerOp(FLOOR_ID, triangle, 0)).toBeNull();
  });
});

describe('room links and names', () => {
  const hubRooms = [
    { id: HUB_B, name: 'Bedroom' },
    { id: HUB_A, name: 'Attic' },
  ];

  it('offers only hub rooms no other map room on the floor links to', () => {
    expect(linkableRooms(floor(), 'room-l', hubRooms).map((hub) => hub.id)).toEqual([HUB_B]);
    expect(linkableRooms(floor(), 'room-rect', hubRooms).map((hub) => hub.id)).toEqual([
      HUB_A,
      HUB_B,
    ]);
  });

  it('titles a room by its hub room, its name or its place', () => {
    expect(roomTitle(room('room-rect'), hubRooms, 0)).toBe('Attic');
    expect(roomTitle(room('room-l'), hubRooms, 1)).toBe('Room 2');
  });

  it('says a room is unattached only when no home room is linked', () => {
    expect(roomLinkNote(room('room-rect'), hubRooms)).toBeNull();
    expect(roomLinkNote(room('room-l'), hubRooms)).toBe(UNLINKED_TEXT);
    expect(roomLinkNote(room('room-rect'), [])).toBe(UNLINKED_TEXT);
  });

  it('writes names trimmed and links only when they change', () => {
    expect(roomNameOp(FLOOR_ID, room('room-l'), '   ')).toBeNull();
    const named = applied([roomNameOp(FLOOR_ID, room('room-l'), ' Hall ')]);
    expect(named.floors[0]?.rooms[1]?.name).toBe('Hall');
    expect(roomLinkOp(FLOOR_ID, room('room-rect'), HUB_A)).toBeNull();
    expect(
      applied([roomLinkOp(FLOOR_ID, room('room-rect'), null)]).floors[0]?.rooms[0]?.homeRoomId,
    ).toBeNull();
  });
});

describe('adding rooms and walls', () => {
  it('places a new room to the right of what is drawn and a new wall below it', () => {
    let next = 0;
    const newId = (): string => `new-${String((next += 1))}`;
    const made = newRoom(floor(), newId);
    const wall = newWall(floor(), 0.1, newId);
    const map = applied([made.op, wall.op]);
    expect(roomRect(outerOf(map, made.id))).toEqual({ x: 8.5, y: 0, width: 4, length: 3 });
    const added = map.floors[0]?.walls.find((item) => item.id === wall.id);
    expect(added?.from).toEqual({ x: 0, y: 4.5 });
  });
});

describe('wall fields', () => {
  const wall = (): HomeMapFloor['walls'][number] => {
    const found = floor().walls[0];
    if (found === undefined) throw new Error('no wall');
    return found;
  };

  it('changes the length along the wall and keeps its start', () => {
    const map = applied([wallLengthOp(FLOOR_ID, wall(), 2.5)]);
    expect(map.floors[0]?.walls[0]?.to).toEqual({ x: 2.5, y: 0 });
    expect(wallLengthOp(FLOOR_ID, wall(), 0)).toBeNull();
  });

  it('refuses an end on top of the other end', () => {
    expect(wallEndOp(FLOOR_ID, wall(), 'to', { x: 0, y: 0 })).toBeNull();
    expect(
      applied([wallEndOp(FLOOR_ID, wall(), 'to', { x: 0, y: 3 })]).floors[0]?.walls[0]?.to,
    ).toEqual({
      x: 0,
      y: 3,
    });
  });
});

describe('numeric fields are validated through the domain ops', () => {
  it('passes valid ops and refuses ops the domain refuses', () => {
    const good = [wallUpdate(FLOOR_ID, 'wall-1', { thickness: 0.2 })];
    expect(checkedOps(MAP, good, ACTOR)).toEqual(good);
    expect(
      checkedOps(MAP, [wallUpdate(FLOOR_ID, 'wall-1', { thickness: -0.1 })], ACTOR),
    ).toBeNull();
    expect(
      checkedOps(MAP, [wallUpdate(FLOOR_ID, 'missing', { thickness: 0.2 })], ACTOR),
    ).toBeNull();
    expect(checkedOps(MAP, [], ACTOR)).toBeNull();
  });
});
