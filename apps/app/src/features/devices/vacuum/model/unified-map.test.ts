import { readFileSync } from 'node:fs';
import { HOME_MAP_WRITE, VACUUM_SCENE, type HomeMap } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { materialChoice } from '../sections/room-floor';
import { materialFailure } from '../sections/room-edits';
import { REACH_GROUPS } from '../sections/rooms-links';
import type { ShownScene } from './room-names';
import {
  ROBOT_REACH,
  houseRobotPose,
  houseSelection,
  houseTrail,
  unifiedMapOf,
  unifiedMaterialOf,
  unifiedMaterialOp,
  unifiedPick,
  unifiedPlaceOf,
  type UnifiedMap,
} from './unified-map';

const ROBOT = '44444444-4444-4444-8444-444444444444';
const OTHER = '55555555-5555-4555-8555-555555555555';
const KITCHEN = '22222222-2222-4222-8222-222222222222';

const scene = VACUUM_SCENE.parse(
  JSON.parse(readFileSync(new URL('./scene-geometry.fixture.json', import.meta.url), 'utf8')),
);

const [first, second] = scene.rooms;
if (first === undefined || second === undefined) throw new Error('fixture has too few rooms');

const shown: ShownScene = {
  ...scene,
  rooms: scene.rooms.map((room) => ({
    ...room,
    robotName: room.name,
    homeRoomId: room.id === first.id ? KITCHEN : null,
    name: room.id === first.id ? 'Kitchen' : room.name,
  })),
};

type Point = Readonly<{ x: number; y: number }>;

const rect = (x: number, y: number, w: number, h: number): Point[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

const roomOf = (id: string, ring: Point[], origin: object, kind = 'tile'): object => ({
  id,
  name: null,
  homeRoomId: null,
  polygon: { outer: ring, holes: [] },
  labelAt: ring[0],
  colourSlot: 2,
  floorMaterial: { kind, variant: null, tint: '#a0a0a0' },
  wallPaint: null,
  ceilingHeight: null,
  origin,
});

const sourceOrigin = (ref: number): object => ({
  kind: 'source',
  sourceId: 'robot-source',
  ref: String(ref),
  overridden: [],
});

const floorOf = (id: string, name: string, rooms: readonly object[]): object => ({
  id,
  name,
  level: 0,
  elevation: 0,
  ceilingHeight: 2.6,
  rooms,
  walls: [],
  openings: [],
  objects: [],
  placements: [],
  annotations: [],
});

const map: HomeMap = HOME_MAP_WRITE.parse({
  id: 'home',
  schemaVersion: 1,
  revision: 4,
  name: 'Synthetic house',
  north: 0,
  updatedAt: '2026-10-25T00:00:00.000Z',
  floors: [
    floorOf('upstairs', 'Upstairs', []),
    floorOf('ground', 'Ground floor', [
      roomOf('map-kitchen', rect(0, 0, 4, 3), sourceOrigin(first.id)),
      roomOf('map-hall', rect(4, 0, 2, 3), sourceOrigin(second.id), 'carpet'),
      roomOf('map-study', rect(6, 0, 3, 3), { kind: 'hand' }),
    ]),
  ],
  sources: [
    {
      id: 'robot-source',
      kind: 'xiaomi_vacuum',
      deviceId: ROBOT,
      floorId: 'ground',
      transform: { rotationDeg: 90, tx: 10, ty: 2, mirrored: false },
      frame: { uid: null, name: null, boundsSignature: 'sig' },
      lastVersion: null,
      lastImportedAt: null,
      base: { rooms: [], walls: [], openings: [] },
      tombstones: [],
    },
  ],
  notices: [],
});

function unifiedOf(): UnifiedMap {
  const place = unifiedPlaceOf(map, ROBOT);
  if (place === null) throw new Error('no place');
  const unified = unifiedMapOf(place, shown, { homeRoomName: () => null });
  if (unified === null) throw new Error('no unified map');
  return unified;
}

describe('the unified vacuum map', () => {
  it('finds the floor the robot feeds and nothing for another device or no map', () => {
    expect(unifiedPlaceOf(map, ROBOT)?.floor.id).toBe('ground');
    expect(unifiedPlaceOf(map, OTHER)).toBeNull();
    expect(unifiedPlaceOf(null, ROBOT)).toBeNull();
  });

  it('pairs the robot rooms with their house rooms and leaves hand rooms out', () => {
    const { rooms } = unifiedOf();
    expect(rooms.toHouse.get(first.id)).toBe('map-kitchen');
    expect(rooms.toRobot.get('map-hall')).toBe(second.id);
    expect(rooms.toRobot.has('map-study')).toBe(false);
    expect(houseSelection(rooms, [second.id, 999])).toStrictEqual(['map-hall']);
  });

  it('names the robot rooms by their home room and draws the dock in the house frame', () => {
    const unified = unifiedOf();
    const names = unified.floor.rooms.map((room) => room.name);
    expect(names).toContain('Kitchen');
    const dock = unified.floor.vacuum?.dock;
    if (scene.dock === null) expect(dock).toBeNull();
    else {
      expect(dock?.x).toBeCloseTo(10 - scene.dock.y, 6);
      expect(dock?.y).toBeCloseTo(2 + scene.dock.x, 6);
    }
  });

  it('moves the live robot and its trail through the source transform', () => {
    const { transform } = unifiedOf();
    const pose = houseRobotPose(transform, { x: 1, y: 0, yaw: 0 });
    expect(pose?.x).toBeCloseTo(10, 6);
    expect(pose?.y).toBeCloseTo(3, 6);
    expect(pose?.yawDeg).toBeCloseTo(90, 6);
    expect(houseRobotPose(transform, null)).toBeNull();
    const trail = houseTrail(transform, {
      base: [{ mopping: false, points: [{ x: 0, y: 1 }] }],
      live: [],
    });
    expect(trail.base[0]?.points[0]?.x).toBeCloseTo(9, 6);
    expect(trail.base[0]?.points[0]?.y).toBeCloseTo(2, 6);
  });

  it('maps a 3D pick on a house room back to the robot room', () => {
    const { rooms } = unifiedOf();
    expect(unifiedPick(rooms, { kind: 'room', id: 'map-kitchen' })).toStrictEqual({
      kind: 'room',
      id: first.id,
    });
    expect(unifiedPick(rooms, { kind: 'room', id: 'map-study' })).toBeNull();
    expect(unifiedPick(rooms, { kind: 'device', id: 'map-kitchen' })).toBeNull();
    expect(unifiedPick(rooms, { kind: 'none' })).toBeNull();
  });

  it('describes the house floor with the robot in its house room', async () => {
    const { describeUnifiedMap } = await import('../components/map-view-model');
    const unified = unifiedOf();
    const pose = { x: 1, y: 1, yaw: 0 };
    expect(describeUnifiedMap(unified, pose, first.id, 'cleaning')).toBe(
      'Map of Ground floor, 3 rooms, robot in Kitchen, cleaning',
    );
    expect(describeUnifiedMap(unified, null, null, null)).toBe('Map of Ground floor, 3 rooms');
  });

  it('hands the 3D stage the house scene with the docked floor in place of the plain one', () => {
    const unified = unifiedOf();
    const ground = unified.scene.floors.find((floor) => floor.id === 'ground');
    expect(ground).toBe(unified.floor);
    expect(unified.scene.floors.map((floor) => floor.id).sort()).toStrictEqual([
      'ground',
      'upstairs',
    ]);
  });
});

describe('floor materials through the home map', () => {
  const label = (code: number): string => `code ${String(code)}`;

  it('reads the material of the house room and names one the robot does not know', () => {
    const unified = unifiedOf();
    expect(unifiedMaterialOf(unified, first.id, label)).toStrictEqual({
      code: 4000,
      label: 'code 4000',
    });
    expect(unifiedMaterialOf(unified, second.id, label)).toStrictEqual({
      code: null,
      label: 'Carpet on the home map',
    });
    expect(unifiedMaterialOf(unified, 999, label)).toBeNull();
  });

  it('writes a known robot material to the house room and keeps its tint', () => {
    const unified = unifiedOf();
    expect(unifiedMaterialOp(unified, first.id, 4011)).toStrictEqual({
      op: 'update',
      kind: 'room',
      floorId: 'ground',
      id: 'map-kitchen',
      patch: { floorMaterial: { kind: 'wood', variant: 'horizontal', tint: '#a0a0a0' } },
    });
    expect(unifiedMaterialOp(unified, first.id, 0)).toBeNull();
    expect(unifiedMaterialOp(unified, first.id, 4999)).toBeNull();
    expect(unifiedMaterialOp(unified, 999, 4000)).toBeNull();
  });

  it('offers only real materials on the map and shows the map material as the choice', () => {
    const row = { name: 'Hall', floor: 0, floorLabel: 'Floor type not set', hidden: false };
    const choice = materialChoice(row, { code: null, label: 'Carpet on the home map' });
    expect(choice.options.some((option) => option.value === '0')).toBe(false);
    expect(choice).toMatchObject({ value: '', placeholder: 'Carpet on the home map' });
    expect(materialChoice(row, null)).toMatchObject({ value: '0' });
  });

  it('reports a change that did not land and stays quiet when it saved', () => {
    expect(materialFailure({ kind: 'saved' })).toBeNull();
    expect(materialFailure({ kind: 'saving' })).toBeNull();
    expect(materialFailure({ kind: 'not_saved' })).toBe('Your last change did not save: try again');
    expect(materialFailure({ kind: 'conflicts', messages: ['This room is locked'] })).toBe(
      'This room is locked',
    );
  });
});

describe('the vacuum page view', () => {
  it('uses the house floor when the robot feeds the home map, on the page only', async () => {
    const view = await import('../components/map-view');
    const unified = unifiedOf();
    expect(view.unifiedOf('page', unified)).toBe(unified);
    expect(view.unifiedOf('full', unified)).toBe(unified);
    expect(view.unifiedOf('face', unified)).toBeNull();
  });
});

describe('what reaches the robot', () => {
  it('says what is sent, what stays on the hub and what is never sent', () => {
    expect(ROBOT_REACH.sends).toStrictEqual([
      'Floor materials the robot knows',
      'Cleaning zones and no-go areas',
    ]);
    expect(ROBOT_REACH.never).toStrictEqual([
      'Room shapes, splits and merges',
      'Walls, doors and windows',
      'Furniture and devices',
      'Paint and notes',
    ]);
    expect(REACH_GROUPS.map((group) => group.title)).toStrictEqual([
      'Reaches the robot',
      'Stays on the hub',
      'Never sent to the robot',
    ]);
  });
});
