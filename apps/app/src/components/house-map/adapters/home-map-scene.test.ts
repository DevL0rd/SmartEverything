import { HOME_MAP_WRITE, type HomeMap } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import type { RenderFloor } from '../render-scene';
import { homeMapRenderScene, type HomeMapSceneLive } from './home-map-scene';

const LIVING_ROOM = '11111111-1111-4111-8111-111111111111';
const KITCHEN = '22222222-2222-4222-8222-222222222222';
const LAMP = '33333333-3333-4333-8333-333333333333';
const HAND = { kind: 'hand' };

type Doc = Readonly<Record<string, unknown>>;

type Point = Readonly<{ x: number; y: number }>;

const rect = (x: number, y: number, w: number, h: number): Point[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

const roomOf = (id: string, ring: Point[], extra: Doc): Doc => ({
  id,
  name: null,
  homeRoomId: null,
  polygon: { outer: ring, holes: [] },
  labelAt: ring[0],
  colourSlot: 3,
  floorMaterial: { kind: 'wood', variant: 'oak', tint: null },
  wallPaint: null,
  ceilingHeight: null,
  origin: HAND,
  ...extra,
});

const wallOf = (
  id: string,
  ends: readonly [Point, Point],
  thickness: number,
  height: number | null,
): Doc => ({
  id,
  from: ends[0],
  to: ends[1],
  thickness,
  height,
  kind: 'solid',
  origin: HAND,
});

const opening = (id: string, wallId: string): Doc => ({
  id,
  wallId,
  offset: 1,
  width: 1,
  kind: 'door',
  sillHeight: 0,
  headHeight: 2.1,
  hinge: 'left',
  swing: 'in',
  contactDeviceId: null,
  lockDeviceId: null,
  origin: HAND,
});

const ground = {
  id: 'ground',
  name: 'Ground floor',
  level: 0,
  elevation: 0,
  ceilingHeight: 2.6,
  rooms: [
    roomOf('living', rect(0, 0, 4, 3), { homeRoomId: LIVING_ROOM, ceilingHeight: 3 }),
    roomOf('kitchen', rect(4, 0, 3, 3), {
      name: 'Robot kitchen',
      origin: { kind: 'source', sourceId: 'robot', ref: '7', overridden: [] },
    }),
  ],
  walls: [
    wallOf(
      'inner',
      [
        { x: 4, y: 0 },
        { x: 4, y: 3 },
      ],
      0.1,
      null,
    ),
    wallOf(
      'outer',
      [
        { x: 0, y: 0 },
        { x: 7, y: 0 },
      ],
      0.2,
      1.1,
    ),
  ],
  openings: [opening('door', 'inner'), opening('lost', 'gone')],
  objects: [
    {
      id: 'sofa',
      modelId: 'cat.future.hover-sofa',
      finish: null,
      params: { width: 2 },
      at: { x: 1, y: 1 },
      rotation: 90,
      elevation: 0,
      label: 'Sofa',
      locked: true,
      origin: HAND,
    },
  ],
  placements: [
    {
      deviceId: LAMP,
      floorId: 'ground',
      at: { x: 5, y: 2 },
      rotation: 45,
      height: 2.4,
      tilt: 0,
      mount: 'ceiling',
      auto: true,
      camera: null,
    },
  ],
  annotations: [
    { id: 'pin', kind: 'pin', at: { x: 9, y: 9 }, text: 'Fuse box' },
    { id: 'ruler', kind: 'measure', from: { x: 0, y: 0 }, to: { x: 4, y: 0 }, text: '4 m' },
  ],
};

const upstairs = {
  ...ground,
  id: 'upstairs',
  name: 'Upstairs',
  level: 1,
  elevation: 2.9,
  rooms: [],
  walls: [],
  openings: [],
  objects: [],
  placements: [],
  annotations: [],
};

const map: HomeMap = HOME_MAP_WRITE.parse({
  id: 'home',
  schemaVersion: 1,
  revision: 12,
  name: 'Synthetic house',
  north: 0,
  updatedAt: '2026-10-25T00:00:00.000Z',
  floors: [upstairs, ground],
  sources: [],
  notices: [],
});

const live: HomeMapSceneLive = {
  homeRoomName: (id) => (id === LIVING_ROOM ? 'Living room' : id === KITCHEN ? 'Kitchen' : null),
  sourceRoom: (sourceId, ref) =>
    sourceId === 'robot' && ref === '7' ? { homeRoomId: KITCHEN, name: 'Robot room 7' } : null,
  device: (id) => (id === LAMP ? { name: 'Ceiling lamp', kind: 'light' } : null),
};

const groundOf = (input: HomeMapSceneLive = live): RenderFloor => {
  const floor = homeMapRenderScene({ map, live: input }).floors[0];
  if (floor === undefined) throw new Error('the synthetic house lost its ground floor');
  return floor;
};

describe('homeMapRenderScene', () => {
  it('orders floors by level and bounds the scene by every element', () => {
    const scene = homeMapRenderScene({ map, live });
    expect(scene.source).toBe('home_map');
    expect(scene.floors.map((floor) => floor.id)).toEqual(['ground', 'upstairs']);
    expect(scene.floors[0]?.bounds).toEqual({ minX: 0, minY: 0, maxX: 7, maxY: 3 });
    expect(scene.floors[1]?.bounds).toBeNull();
    expect(scene.bounds).toEqual({ minX: 0, minY: 0, maxX: 7, maxY: 3 });
  });

  it('names hand rooms by their home room and source rooms by their vacuum link', () => {
    const [living, kitchen] = groundOf().rooms;
    expect(living).toMatchObject({
      name: 'Living room',
      homeRoomId: LIVING_ROOM,
      ceilingHeight: 3,
    });
    expect(kitchen).toMatchObject({ name: 'Kitchen', homeRoomId: KITCHEN, ceilingHeight: 2.6 });
    expect(living?.areaM2).toBe(12);
    expect(living?.floor).toEqual({ status: 'material', kind: 'wood', variant: 'oak', tint: null });
    const bare = groundOf({}).rooms;
    expect(bare.map((room) => [room.name, room.homeRoomId])).toEqual([
      [null, LIVING_ROOM],
      ['Robot kitchen', null],
    ]);
  });

  it('names a robot room by the home room stored on the map room without any robot link', () => {
    const stored = HOME_MAP_WRITE.parse({
      ...map,
      floors: [
        {
          ...ground,
          rooms: [
            roomOf('linked', rect(0, 0, 4, 3), {
              name: 'Room 1',
              homeRoomId: KITCHEN,
              origin: { kind: 'source', sourceId: 'robot', ref: '1', overridden: [] },
            }),
            roomOf('loose', rect(4, 0, 3, 3), {
              name: 'Room 2',
              origin: { kind: 'source', sourceId: 'robot', ref: '2', overridden: [] },
            }),
          ],
        },
      ],
    });
    const names = homeMapRenderScene({ map: stored, live: {} });
    const named = homeMapRenderScene({
      map: stored,
      live: { homeRoomName: (id) => (id === KITCHEN ? 'Kitchen' : null) },
    });
    expect(names.floors[0]?.rooms.map((room) => room.homeRoomId)).toEqual([KITCHEN, null]);
    expect(named.floors[0]?.rooms.map((room) => [room.name, room.homeRoomId])).toEqual([
      ['Kitchen', KITCHEN],
      ['Room 2', null],
    ]);
  });

  it('resolves wall heights and exterior walls from the floor defaults', () => {
    const walls = groundOf().walls;
    expect(walls.map(({ id, height, exterior }) => ({ id, height, exterior }))).toEqual([
      { id: 'inner', height: 2.6, exterior: false },
      { id: 'outer', height: 1.1, exterior: true },
    ]);
  });

  it('places openings on their wall, finds both rooms and reports openings without a wall', () => {
    const scene = homeMapRenderScene({ map, live });
    const door = scene.floors[0]?.openings;
    expect(door).toHaveLength(1);
    expect(door?.[0]).toMatchObject({
      id: 'door',
      wallId: 'inner',
      from: { x: 4, y: 1 },
      to: { x: 4, y: 2 },
      kind: 'door',
    });
    expect([...(door?.[0]?.roomIds ?? [])].sort()).toEqual(['kitchen', 'living']);
    expect(scene.issues).toEqual([
      { kind: 'opening_without_wall', floorId: 'ground', elementId: 'lost' },
    ]);
  });

  it('keeps unknown model ids, places devices in rooms and splits annotations', () => {
    const floor = groundOf();
    expect(floor.objects[0]).toMatchObject({
      modelId: 'cat.future.hover-sofa',
      kind: 'cat.future.hover-sofa',
      rotationDeg: 90,
      roomId: 'living',
      footprint: null,
      params: { width: 2 },
    });
    expect(floor.placements[0]).toMatchObject({
      deviceId: LAMP,
      name: 'Ceiling lamp',
      kind: 'light',
      rotationDeg: 45,
      roomId: 'kitchen',
      mount: 'ceiling',
    });
    expect(floor.markers).toEqual([
      { id: 'pin', kind: 'pin', at: { x: 9, y: 9 }, label: 'Fuse box' },
    ]);
    expect(floor.measures).toEqual([
      { id: 'ruler', from: { x: 0, y: 0 }, to: { x: 4, y: 0 }, text: '4 m' },
    ]);
    expect(floor.vacuum).toBeNull();
  });

  it('keys the scene by revision and by the live names it shows', () => {
    const key = homeMapRenderScene({ map, live }).key;
    expect(key.startsWith('home:12:')).toBe(true);
    expect(homeMapRenderScene({ map, live }).key).toBe(key);
    const renamed: HomeMapSceneLive = {
      ...live,
      device: (id) => (id === LAMP ? { name: 'Pendant', kind: 'light' } : null),
    };
    expect(homeMapRenderScene({ map, live: renamed }).key).not.toBe(key);
    expect(homeMapRenderScene({ map: { ...map, revision: 13 }, live }).key).not.toBe(key);
    expect(
      homeMapRenderScene({ map, live: { ...live, device: () => null } }).floors[0]?.placements[0]
        ?.name,
    ).toBeNull();
  });
});
