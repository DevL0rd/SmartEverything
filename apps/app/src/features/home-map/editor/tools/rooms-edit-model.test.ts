import { describe, expect, it } from 'vitest';
import {
  HOME_MAP_POLYGON,
  HOME_MAP_ROOM_WRITE,
  homeMapRingArea,
  type HomeMapOp,
  type HomeMapRoom,
} from '@smarteverything/domain';
import { handleNear, mergeRings, roomHandles, sizeText, splitRing } from './rooms-edit-geometry';
import {
  addCorner,
  linkAction,
  mergeCandidates,
  mergeRooms,
  moveCornerOp,
  moveRoomOp,
  namesItself,
  pushSideOp,
  removeCornerOp,
  resizeRoomOp,
  splitRoom,
  type EditFloor,
} from './rooms-edit-model';

const HUB = '6f1c2a40-0000-4000-8000-000000000001';
const DEVICE = '6f1c2a40-0000-4000-8000-0000000000d1';

function room(
  id: string,
  outer: readonly { x: number; y: number }[],
  extra: Readonly<Record<string, unknown>> = {},
): HomeMapRoom {
  return HOME_MAP_ROOM_WRITE.parse({
    id,
    name: null,
    homeRoomId: null,
    polygon: { outer, holes: [] },
    labelAt: { x: 0, y: 0 },
    colourSlot: 1,
    floorMaterial: { kind: 'wood', variant: 'oak', tint: null },
    wallPaint: '#eeeeee',
    ceilingHeight: 2.6,
    origin: { kind: 'hand' },
    ...extra,
  });
}

const rect = (x: number, y: number, w: number, h: number): { x: number; y: number }[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

const living = room('living', rect(0, 0, 4, 3));
const hall = room('hall', rect(4, 0, 2, 6), { name: 'Hall' });
const shed = room('shed', rect(10, 10, 2, 2));
const floor: EditFloor = { id: 'floor-1', rooms: [living, hall, shed] };

describe('splitRing', () => {
  it('cuts a rectangle into two rectangles along the line', () => {
    const pieces = splitRing(rect(0, 0, 4, 3), { x: 1, y: -1 }, { x: 1, y: 4 });
    expect(pieces?.map((ring) => homeMapRingArea(ring)).sort()).toEqual([3, 9]);
  });

  it('cuts only the arm of an L shape that the line crosses', () => {
    const l = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 4 },
      { x: 0, y: 4 },
    ];
    const pieces = splitRing(l, { x: -1, y: 3 }, { x: 0.5, y: 3 });
    expect(pieces?.map((ring) => homeMapRingArea(ring)).sort()).toEqual([1, 6]);
  });

  it('refuses a line that misses the room', () => {
    expect(splitRing(rect(0, 0, 4, 3), { x: 6, y: 0 }, { x: 6, y: 3 })).toBeNull();
  });
});

describe('mergeRings', () => {
  it('joins two rooms that share part of a wall into one outline', () => {
    const ring = mergeRings(rect(0, 0, 4, 3), rect(4, 0, 2, 6));
    expect(ring).not.toBeNull();
    expect(homeMapRingArea(ring ?? [])).toBeCloseTo(24);
    expect(ring).toHaveLength(6);
  });

  it('drops the corners left on a straight wall after joining', () => {
    expect(mergeRings(rect(0, 0, 2, 3), rect(2, 0, 2, 3))).toHaveLength(4);
  });

  it('refuses rooms that do not touch', () => {
    expect(mergeRings(rect(0, 0, 2, 2), rect(5, 5, 2, 2))).toBeNull();
  });

  it('puts back the room a split cut', () => {
    const pieces = splitRing(rect(0, 0, 4, 3), { x: 1, y: -1 }, { x: 1, y: 4 });
    const [a, b] = pieces ?? [[], []];
    expect(homeMapRingArea(mergeRings(a, b) ?? [])).toBeCloseTo(12);
  });
});

describe('splitRoom', () => {
  it('keeps the larger piece and adds the cut piece as an unlinked room with the same finish', () => {
    const step = splitRoom(
      floor,
      'living',
      { from: { x: 1, y: -1 }, to: { x: 1, y: 4 } },
      () => 'new',
    );
    expect(step.kind).toBe('ops');
    if (step.kind !== 'ops') return;
    const [reshape, add] = step.ops;
    expect(reshape).toMatchObject({ op: 'update', id: 'living' });
    expect(add).toMatchObject({
      op: 'add',
      kind: 'room',
      element: {
        id: 'new',
        name: null,
        homeRoomId: null,
        wallPaint: '#eeeeee',
        ceilingHeight: 2.6,
      },
    });
    expect(step.select).toBe('new');
  });

  it('refuses a line that does not cross the room', () => {
    const step = splitRoom(
      floor,
      'living',
      { from: { x: 8, y: 0 }, to: { x: 8, y: 1 } },
      () => 'x',
    );
    expect(step).toEqual({ kind: 'refused', reason: 'no_cut' });
  });
});

describe('mergeRooms', () => {
  it('removes the other room and gives the kept room the joined outline and the other name', () => {
    const step = mergeRooms(floor, 'living', 'hall');
    expect(step.kind).toBe('ops');
    if (step.kind !== 'ops') return;
    expect(step.ops[0]).toEqual({ op: 'remove', kind: 'room', floorId: 'floor-1', id: 'hall' });
    expect(step.ops[1]).toMatchObject({ op: 'update', id: 'living', patch: { name: 'Hall' } });
  });

  it('takes the home room of the other room when the kept room has none', () => {
    const linked = { ...floor, rooms: [living, { ...hall, homeRoomId: HUB }] };
    const step = mergeRooms(linked, 'living', 'hall');
    expect(step.kind === 'ops' ? step.ops[1] : null).toMatchObject({ patch: { homeRoomId: HUB } });
  });

  it('refuses rooms that do not share a wall and lists only touching rooms', () => {
    expect(mergeRooms(floor, 'living', 'shed')).toEqual({
      kind: 'refused',
      reason: 'not_touching',
    });
    expect(mergeCandidates(floor, 'living').map((item) => item.id)).toEqual(['hall']);
  });
});

describe('linkAction', () => {
  it('writes homeRoomId for a room drawn by hand', () => {
    expect(linkAction({ sources: [] }, 'floor-1', living, HUB)).toMatchObject({
      kind: 'op',
      op: { op: 'update', id: 'living', patch: { homeRoomId: HUB } },
    });
  });

  it('goes through the vacuum room link for a room from a robot map', () => {
    const robot = room('robot', rect(0, 0, 2, 2), {
      origin: { kind: 'source', sourceId: 'src-1', ref: '17', overridden: [] },
    });
    const sources = [{ id: 'src-1', deviceId: DEVICE }];
    expect(linkAction({ sources }, 'floor-1', robot, HUB)).toEqual({
      kind: 'vacuum',
      deviceId: DEVICE,
      mapRoomId: '17',
      roomId: HUB,
    });
    expect(linkAction({ sources: [] }, 'floor-1', robot, HUB)).toEqual({ kind: 'no_robot' });
  });

  it('gives a name field only to unlinked rooms drawn by hand', () => {
    expect(namesItself(living)).toBe(true);
    expect(namesItself({ ...living, homeRoomId: HUB })).toBe(false);
  });
});

function outerOf(op: HomeMapOp | null | undefined): unknown {
  const polygon = op?.op === 'update' ? op.patch['polygon'] : null;
  return HOME_MAP_POLYGON.safeParse(polygon).data?.outer ?? null;
}

describe('room corners and sides', () => {
  it('moves one corner and refuses a corner that makes the outline cross itself', () => {
    expect(outerOf(moveCornerOp('floor-1', living, 2, { x: 5, y: 4 }))).toEqual([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 5, y: 4 },
      { x: 0, y: 3 },
    ]);
    expect(moveCornerOp('floor-1', living, 0, { x: 5, y: 2 })).toBeNull();
  });

  it('pushes a side out along its normal', () => {
    expect(outerOf(pushSideOp('floor-1', living, 0, -1))).toEqual([
      { x: 0, y: -1 },
      { x: 4, y: -1 },
      { x: 4, y: 3 },
      { x: 0, y: 3 },
    ]);
  });

  it('adds a corner in the middle of a side and selects it', () => {
    const made = addCorner('floor-1', living, 1);
    expect(made?.corner).toBe(2);
    expect(outerOf(made?.op)).toEqual([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 1.5 },
      { x: 4, y: 3 },
      { x: 0, y: 3 },
    ]);
  });

  it('removes a corner but keeps at least three', () => {
    expect(outerOf(removeCornerOp('floor-1', living, 3))).toEqual([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
    ]);
    const triangle = room('tri', rect(0, 0, 4, 3).slice(0, 3));
    expect(removeCornerOp('floor-1', triangle, 0)).toBeNull();
  });

  it('resizes the room around its middle and moves it as one', () => {
    expect(outerOf(resizeRoomOp('floor-1', living, 'x', 6))).toEqual([
      { x: -1, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 3 },
      { x: -1, y: 3 },
    ]);
    expect(resizeRoomOp('floor-1', living, 'y', 0)).toBeNull();
    expect(moveRoomOp('floor-1', 'living', { x: 1, y: -2 })).toEqual({
      op: 'move',
      kind: 'room',
      floorId: 'floor-1',
      id: 'living',
      dx: 1,
      dy: -2,
    });
  });

  it('finds the nearest handle within the radius', () => {
    const handles = roomHandles(living);
    expect(handles).toHaveLength(8);
    expect(handleNear(handles, { x: 3.9, y: 0.1 }, 0.3)).toMatchObject({
      kind: 'corner',
      index: 1,
    });
    expect(handleNear(handles, { x: 0.1, y: 1.4 }, 0.3)).toMatchObject({ kind: 'side', index: 3 });
    expect(handleNear(handles, { x: 2, y: 1.5 }, 0.3)).toBeNull();
  });

  it('writes the size and area of the room', () => {
    expect(sizeText(living.polygon.outer)).toBe('4.00 × 3.00 m · 12.0 m²');
  });
});
