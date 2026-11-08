import { deflateSync } from 'node:zlib';
import { VACUUM_SCENE } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  MAP_DOCUMENT,
  MapBlobError,
  buildRooms,
  buildVacuumScene,
  decodeMapLayer,
  roomCellCounts,
  sceneBounds,
  toDockPoint,
  toDockPose,
  type MapDocument,
} from '../src';
import {
  chainLoops,
  douglasPeucker,
  scanRooms,
  simplifyRing,
  type EdgeMap,
  type OutlinePoint,
} from '../src/vacuum/scene-rooms';
import { pv11glMap } from './vacuum-support';

const FETCHED_AT = '2026-10-24T10:00:00.000Z';
const SQUARE_METRES_PER_CELL = 0.0025;

function documentOf(
  rows: readonly string[],
  extra: Readonly<Record<string, unknown>> = {},
): MapDocument {
  const cells = Uint8Array.from(
    rows.flatMap((row) => row.split('').map((symbol) => (symbol === '.' ? 0 : Number(symbol)))),
  );
  return MAP_DOCUMENT.parse({
    width: rows[0]?.length ?? 0,
    height: rows.length,
    origin_x: 1000,
    origin_y: -2000,
    resolution: 50,
    map_data: deflateSync(cells).toString('base64'),
    ...extra,
  });
}

function sceneOf(map: MapDocument): ReturnType<typeof buildVacuumScene> {
  return buildVacuumScene({ map, index: 7, slot: 'current', fetchedAt: FETCHED_AT });
}

function signedArea(ring: readonly OutlinePoint[]): number {
  return (
    ring.reduce((sum, point, index) => {
      const next = ring[(index + 1) % ring.length];
      return sum + (next === undefined ? 0 : point.x * next.y - next.x * point.y);
    }, 0) / 2
  );
}

function roomRings(map: MapDocument, id: number): readonly (readonly OutlinePoint[])[] {
  const room = buildRooms(map, decodeMapLayer(map, 'map_data')).find((entry) => entry.id === id);
  return room?.rings ?? [];
}

describe('synthetic pv11gl scene', () => {
  const map = pv11glMap('current');
  const cells = decodeMapLayer(map, 'map_data');
  const counts = roomCellCounts(cells);
  const scene = sceneOf(map);

  it('builds a scene that satisfies the domain contract', () => {
    expect(VACUUM_SCENE.parse(scene)).toEqual(scene);
    expect(scene.index).toBe(7);
    expect(scene.slot).toBe('current');
    expect(scene.fetchedAt).toBe(FETCHED_AT);
    expect(scene.name).toBe('Fixture');
  });

  it('has the fixture rooms in id order with their cell areas', () => {
    expect(scene.rooms.map((room) => room.id)).toEqual([3, 4, 5, 6, 8]);
    for (const room of scene.rooms) {
      expect(room.areaM2).toBeCloseTo((counts.get(room.id) ?? 0) * SQUARE_METRES_PER_CELL, 10);
    }
    expect(scene.rooms.map((room) => room.name)).toEqual([
      'Fixture room 3',
      'Fixture room 4',
      'Fixture room 5',
      'Fixture room 6',
      'Fixture room 8',
    ]);
  });

  it('takes colour slots, label points and settings from the map', () => {
    expect(scene.rooms.map((room) => room.colour)).toEqual([1, 3, 3, 4, 4]);
    expect(scene.rooms[0]?.label).toEqual({ x: 1.8, y: 0.65 });
    expect(scene.rooms[4]?.label).toEqual({ x: 5.95, y: 3.75 });
    expect(scene.rooms[0]?.settings).toEqual({ suction: 2, water: 1, mode: 3, repeats: 1 });
    expect(scene.rooms.every((room) => !room.hidden && room.floor === 0)).toBe(true);
  });

  it('traces every room outline as simple metre polygons on the cell lattice', () => {
    for (const room of scene.rooms) {
      expect(room.rings.length).toBeGreaterThan(0);
      for (const ring of room.rings) {
        expect(ring.length).toBeGreaterThanOrEqual(4);
        for (const point of ring) {
          expect(((point.x * 1000 - map.origin_x) / map.resolution) % 1).toBeCloseTo(0, 6);
          expect(((point.y * 1000 - map.origin_y) / map.resolution) % 1).toBeCloseTo(0, 6);
        }
      }
      const outer = room.rings.reduce((best, ring) =>
        Math.abs(signedArea(ring)) > Math.abs(signedArea(best)) ? ring : best,
      );
      expect(signedArea(outer)).toBeGreaterThan(0);
      expect(Math.abs(signedArea(outer) - room.areaM2) / room.areaM2).toBeLessThan(0.05);
    }
  });

  it('places the dock and the robot in metres with yaw in radians', () => {
    expect(scene.dock).toEqual({ x: 0, y: 1, yaw: -1.571 });
    expect(scene.robot).toEqual({ x: 2.1, y: 0, yaw: 3.12 });
  });

  it('expresses house coordinates in the dock frame', () => {
    const { dock, robot } = scene;
    if (dock === null || robot === null) throw new Error('fixture has a dock and a robot');
    const atDock = toDockPose(dock, dock);
    expect(atDock.x).toBeCloseTo(0, 12);
    expect(atDock.y).toBeCloseTo(0, 12);
    expect(atDock.yaw).toBeCloseTo(0, 12);
    const ahead = toDockPoint(
      { x: dock.x + Math.cos(dock.yaw), y: dock.y + Math.sin(dock.yaw) },
      dock,
    );
    expect(ahead.x).toBeCloseTo(1, 12);
    expect(ahead.y).toBeCloseTo(0, 12);
    const left = toDockPoint(
      { x: dock.x - Math.sin(dock.yaw), y: dock.y + Math.cos(dock.yaw) },
      dock,
    );
    expect(left.x).toBeCloseTo(0, 12);
    expect(left.y).toBeCloseTo(1, 12);
    const relative = toDockPose(robot, dock);
    expect(Math.hypot(relative.x, relative.y)).toBeCloseTo(
      Math.hypot(robot.x - dock.x, robot.y - dock.y),
      12,
    );
    expect(relative.x).toBeCloseTo(1, 2);
    expect(relative.y).toBeCloseTo(2.1, 2);
    expect(relative.yaw).toBeCloseTo(robot.yaw - dock.yaw - 2 * Math.PI, 12);
  });

  it('frames the content, the dock and the robot', () => {
    const { bounds } = scene;
    expect(bounds.minX).toBeGreaterThanOrEqual(map.origin_x / 1000);
    expect(bounds.maxX).toBeLessThanOrEqual((map.origin_x + map.width * map.resolution) / 1000);
    expect(bounds.minY).toBeGreaterThanOrEqual(map.origin_y / 1000);
    expect(bounds.maxY).toBeLessThanOrEqual((map.origin_y + map.height * map.resolution) / 1000);
    for (const room of scene.rooms) {
      for (const point of room.rings.flat()) {
        expect(point.x).toBeGreaterThanOrEqual(bounds.minX);
        expect(point.x).toBeLessThanOrEqual(bounds.maxX);
        expect(point.y).toBeGreaterThanOrEqual(bounds.minY);
        expect(point.y).toBeLessThanOrEqual(bounds.maxY);
      }
    }
  });

  it('leaves the parts of later tasks empty', () => {
    expect([
      scene.walls,
      scene.doors,
      scene.carpets,
      scene.furniture,
      scene.objects,
      scene.zones,
      scene.trail,
    ]).toEqual([[], [], [], [], [], [], []]);
  });

  it('builds the saved and backup slots with the same five rooms', () => {
    for (const slot of ['saved', 'backup'] as const) {
      const other = buildVacuumScene({
        map: pv11glMap(slot),
        index: 1,
        slot,
        fetchedAt: FETCHED_AT,
      });
      expect(VACUUM_SCENE.safeParse(other).success).toBe(true);
      expect(other.rooms.map((room) => room.id)).toEqual([3, 4, 5, 6, 8]);
      expect(other.name).toBeNull();
      expect(other.robot).toBeNull();
    }
  });
});

describe('room outlines', () => {
  it('traces a rectangle to four corners with the interior on the left', () => {
    const map = documentOf(['.....', '.333.', '.333.', '.....']);
    const rings = roomRings(map, 3);
    expect(rings).toHaveLength(1);
    const ring = rings[0] ?? [];
    expect(ring).toHaveLength(4);
    expect(signedArea(ring)).toBeCloseTo(6 * SQUARE_METRES_PER_CELL, 10);
    expect(ring).toContainEqual({ x: 1.05, y: -1.95 });
    expect(ring).toContainEqual({ x: 1.2, y: -1.85 });
  });

  it('traces an L shape to six corners and a room with a hole to an outer and a hole ring', () => {
    const lShape = documentOf(['.....', '.3...', '.3...', '.333.', '.....']);
    expect(roomRings(lShape, 3)[0]).toHaveLength(6);
    const holed = documentOf(['.......', '.33333.', '.3...3.', '.33333.', '.......']);
    const rings = roomRings(holed, 3);
    expect(rings.map((ring) => Math.sign(signedArea(ring))).toSorted()).toEqual([-1, 1]);
    const net = rings.reduce((sum, ring) => sum + signedArea(ring), 0);
    expect(net).toBeCloseTo(12 * SQUARE_METRES_PER_CELL, 10);
  });

  it('separates cells that only touch at a corner into two rings', () => {
    const map = documentOf(['.....', '.3...', '..3..', '.....']);
    const rings = roomRings(map, 3);
    expect(rings).toHaveLength(2);
    for (const ring of rings) {
      expect(ring).toHaveLength(4);
      expect(signedArea(ring)).toBeCloseTo(SQUARE_METRES_PER_CELL, 10);
    }
  });

  it('gives neighbouring rooms the shared boundary and removes stair steps within half a cell', () => {
    const map = documentOf(['......', '.3344.', '.3344.', '......']);
    expect(roomRings(map, 3)[0]).toHaveLength(4);
    expect(roomRings(map, 4)[0]).toHaveLength(4);
    const diagonal = documentOf(['.........', '.33333...', '..33333..', '...33333.', '.........']);
    const ring = roomRings(diagonal, 3)[0] ?? [];
    expect(ring.length).toBeLessThan(10);
    expect(ring.length).toBeGreaterThanOrEqual(4);
  });

  it('keeps unnamed rooms usable with a default name, no settings and a label inside the room', () => {
    const map = documentOf(['.....', '.777.', '.7...', '.....']);
    const [room] = buildRooms(map, decodeMapLayer(map, 'map_data'));
    expect(room?.name).toBe('Room 7');
    expect(room?.colour).toBe(0);
    expect(room?.floor).toBe(0);
    expect(room?.settings).toBeNull();
    expect(room?.label).toEqual({ x: 1.125, y: -1.925 });
  });

  it('reports hidden rooms, floors and missing setting fields as given', () => {
    const map = documentOf(['....', '.55.', '....'], {
      room_attrs: [{ id: 5, room_name: 'Study', notshow: 1, floor: 4010, fan_level: 3 }],
      map_room_info: [{ grid_id: 5, room_id: 0, color: 2 }],
    });
    const [room] = buildRooms(map, decodeMapLayer(map, 'map_data'));
    expect(room).toMatchObject({
      id: 5,
      name: 'Study',
      colour: 2,
      floor: 4010,
      hidden: true,
      settings: { suction: 3, water: null, mode: null, repeats: null },
    });
  });

  it('ignores cells that are not room grid values', () => {
    const map = documentOf(['.12.', '....']);
    expect(scanRooms(decodeMapLayer(map, 'map_data'), map.width, map.height).size).toBe(0);
  });

  it('fails with a named error when the boundary is not closed', () => {
    const open: EdgeMap = new Map([[0, [1]]]);
    expect(() => chainLoops(open, 5)).toThrow(MapBlobError);
  });
});

describe('simplification', () => {
  const line = (...pairs: readonly (readonly [number, number])[]): readonly OutlinePoint[] =>
    pairs.map(([x, y]) => ({ x, y }));

  it('drops points within the tolerance of the chord and keeps a farther corner', () => {
    expect(douglasPeucker(line([0, 0], [1, 0.4], [2, -0.4], [4, 0]), 0.5)).toEqual(
      line([0, 0], [4, 0]),
    );
    expect(douglasPeucker(line([0, 0], [2, 2], [4, 0]), 0.5)).toEqual(line([0, 0], [2, 2], [4, 0]));
  });

  it('measures the distance to the segment, not to the infinite line', () => {
    const kept = douglasPeucker(line([0, 0], [5, 0.2], [1, 0], [0, 0.01]), 0.5);
    expect(kept.length).toBeGreaterThan(2);
  });

  it('handles a segment of zero length', () => {
    const kept = douglasPeucker(line([0, 0], [0, 3], [0, 0]), 0.5);
    expect(kept).toEqual(line([0, 0], [0, 3], [0, 0]));
  });

  it('simplifies a closed ring without losing its square corners', () => {
    const square = line([0, 0], [4, 0], [4, 4], [0, 4]);
    expect(simplifyRing(square, 0.5)).toHaveLength(4);
  });
});

describe('bounds and poses', () => {
  it('uses the whole frame when the map has no content', () => {
    const map = documentOf(['...', '...']);
    expect(sceneOf(map).bounds).toEqual({ minX: 1, minY: -2, maxX: 1.15, maxY: -1.9 });
  });

  it('frames only the non-empty cells and grows to hold a pose outside them', () => {
    const map = documentOf(['.....', '..33.', '.....']);
    const cells = decodeMapLayer(map, 'map_data');
    expect(sceneBounds(map, cells, [null])).toEqual({
      minX: 1.1,
      minY: -1.95,
      maxX: 1.2,
      maxY: -1.9,
    });
    expect(sceneBounds(map, cells, [{ x: 5, y: -4, yaw: 0 }, null]).maxX).toBe(5);
    expect(sceneBounds(map, cells, [{ x: 0, y: 0, yaw: 0 }]).minY).toBe(-1.95);
  });

  it('has no dock without a pile and no robot without a position', () => {
    const map = documentOf(['.33.'], { have_pile: false, pile_x: 1, pile_y: 2 });
    expect(sceneOf(map).dock).toBeNull();
    expect(sceneOf(map).robot).toBeNull();
    const noCoordinates = documentOf(['.33.'], { have_pile: true });
    expect(sceneOf(noCoordinates).dock).toBeNull();
  });

  it('accepts a dock without a yaw', () => {
    const map = documentOf(['.33.'], { have_pile: true, pile_x: 1100, pile_y: -1950 });
    expect(sceneOf(map).dock).toEqual({ x: 1.1, y: -1.95, yaw: 0 });
  });

  it('refuses a layer of the wrong size with a named error', () => {
    const map = MAP_DOCUMENT.parse({
      width: 4,
      height: 4,
      origin_x: 0,
      origin_y: 0,
      resolution: 50,
      map_data: deflateSync(Uint8Array.from([3, 3])).toString('base64'),
    });
    expect(() => sceneOf(map)).toThrow(MapBlobError);
  });
});
