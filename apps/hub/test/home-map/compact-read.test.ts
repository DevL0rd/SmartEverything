import { HOME_MAP_COMPACT, type HomeMap } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { compactHomeMap } from '../../src/home-map/compact-read';
import {
  deviceId,
  floorOf,
  houseFloor,
  mapOf,
  objectAt,
  placementAt,
  tenRoomHouse,
} from './compact-fixtures';

const TITLES = new Map([
  ['cat.seating.sofa_three', 'Three-seat sofa'],
  ['cat.tables.coffee_table', 'Coffee table'],
  ['cat.storage.bookcase', 'Bookcase'],
]);

const nameOf = (modelId: string): string => TITLES.get(modelId) ?? modelId;

const RING_KEYS = ['polygon', 'outer', 'holes', 'labelAt', 'annotations'];

function keysOf(value: unknown): readonly string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, entry]) => [key, ...keysOf(entry)]);
}

const withPlacements = (...placements: readonly Record<string, unknown>[]): HomeMap =>
  mapOf([{ ...houseFloor(1), objects: [], placements }]);

const positionOf = (map: HomeMap, index = 0): string | undefined =>
  compactHomeMap(map, nameOf).floors[0]?.devices[index]?.position;

describe('compact home map', () => {
  it('answers the contract schema and keeps the revision and name', () => {
    const compact = compactHomeMap(tenRoomHouse(), nameOf);
    expect(HOME_MAP_COMPACT.parse(compact)).toEqual(compact);
    expect(compact).toMatchObject({ view: 'compact', revision: 7, name: 'Test house', north: 0 });
  });

  it('carries no rings or outlines, only bounds', () => {
    const compact = compactHomeMap(tenRoomHouse(), nameOf);
    const keys = new Set(keysOf(compact));
    for (const key of RING_KEYS) expect(keys.has(key)).toBe(false);
    expect(compact.floors[0]?.rooms[0]).toEqual({
      id: 'room-0',
      name: 'Hall',
      homeRoomId: null,
      areaSquareMetres: 20,
      bounds: { minX: 0, minY: 0, maxX: 5, maxY: 4 },
    });
  });

  it('lists furniture by catalogue name and the room it stands in', () => {
    const objects = compactHomeMap(tenRoomHouse(), nameOf).floors[0]?.objects ?? [];
    expect(objects).toHaveLength(30);
    expect(
      objects.slice(0, 3).map(({ id, name, modelId, roomId }) => [id, name, modelId, roomId]),
    ).toEqual([
      ['sofa-0', 'Three-seat sofa', 'cat.seating.sofa_three', 'room-0'],
      ['table-0', 'Coffee table', 'cat.tables.coffee_table', 'room-0'],
      ['shelf-0', 'Bookcase', 'cat.storage.bookcase', 'room-0'],
    ]);
    expect(objects.find((object) => object.id === 'sofa-6')?.roomId).toBe('room-6');
  });

  it('prefers the label, names unknown models by their id and leaves strays without a room', () => {
    const floor = houseFloor(1);
    const map = mapOf([
      {
        ...floor,
        objects: [
          objectAt('a', 'cat.seating.sofa_three', { x: 1, y: 1 }, 'Grandma sofa'),
          objectAt('b', 'plugin.unknown_chair', { x: 1, y: 1 }),
          objectAt('c', 'cat.storage.bookcase', { x: 80, y: 80 }),
        ],
      },
    ]);
    const objects = compactHomeMap(map, nameOf).floors[0]?.objects ?? [];
    expect(objects.map(({ id, name, modelId, roomId }) => [id, name, modelId, roomId])).toEqual([
      ['a', 'Grandma sofa', 'cat.seating.sofa_three', 'room-0'],
      ['b', 'plugin.unknown_chair', 'plugin.unknown_chair', 'room-0'],
      ['c', 'Bookcase', 'cat.storage.bookcase', null],
    ]);
  });

  it('places devices in words: middle, wall, corner and outside', () => {
    const map = withPlacements(
      placementAt(deviceId(0), { x: 2.5, y: 2 }, 'ceiling', 2.6),
      placementAt(deviceId(1), { x: 0.3, y: 1 }, 'wall', 1.2),
      placementAt(deviceId(2), { x: 4.8, y: 3.8 }, 'floor'),
      placementAt(deviceId(3), { x: 2.5, y: 3.8 }, 'table', 0.75),
      placementAt(deviceId(4), { x: 90, y: 90 }, 'floor'),
    );
    const devices = compactHomeMap(map, nameOf).floors[0]?.devices;
    expect(devices?.map((device) => device.position)).toEqual([
      'Hall, in the middle, on the ceiling',
      'Hall, by the west wall, on the wall, 1.2 m up',
      'Hall, in the north-east corner, on the floor',
      'Hall, by the north wall, on a table',
      'Outside every room, on the floor',
    ]);
    expect(devices?.map((device) => device.roomId)).toEqual([
      'room-0',
      'room-0',
      'room-0',
      'room-0',
      null,
    ]);
  });

  it('turns the wall words with the map north', () => {
    const placements = [placementAt(deviceId(0), { x: 0.3, y: 2 }, 'wall', 1)];
    const rotated = mapOf([{ ...houseFloor(1), objects: [], placements }], 90);
    expect(positionOf(rotated)).toBe('Hall, by the south wall, on the wall, 1 m up');
    expect(compactHomeMap(rotated, nameOf)).toMatchObject({ north: 90 });
  });

  it('answers every floor of a two floor house', () => {
    const upstairs = { ...houseFloor(4), id: 'upper', name: 'Upstairs', level: 1, placements: [] };
    const map = mapOf([houseFloor(2), upstairs]);
    const floors = compactHomeMap(map, nameOf).floors;
    expect(floors.map((floor) => [floor.id, floor.level, floor.rooms.length])).toEqual([
      ['ground', 0, 2],
      ['upper', 1, 4],
    ]);
    expect(floorOf(map).placements).toHaveLength(4);
  });

  it('is a fraction of the full map on a 10-room house', () => {
    const map = tenRoomHouse();
    const full = JSON.stringify(map).length;
    const compact = JSON.stringify(compactHomeMap(map, nameOf)).length;
    expect(compact * 2).toBeLessThan(full);
  });
});
