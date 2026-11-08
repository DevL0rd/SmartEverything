import { deflateSync } from 'node:zlib';
import { VACUUM_SCENE } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  MAP_DOCUMENT,
  NO_PUSHED_MAP_OBJECTS,
  VacuumCodecError,
  buildCarpets,
  buildDoors,
  buildFurniture,
  buildObjects,
  buildSills,
  buildVacuumScene,
  buildWalls,
  buildWallsLayer,
  buildZones,
  decodeAiObjects,
  decodeFurniture,
  decodeHiddenZones,
  decodeRestrictedAreas,
  decodeSills,
  decodeVirtualWalls,
  decodeMapLayer,
  type MapDocument,
} from '../src';
import { pv11glMap } from './vacuum-support';

const LINE_EXTERIOR = 0;
const LINE_OPENING = 1;
const LINE_INTERIOR = 2;
const GRID_UNKNOWN = 0;
const GRID_WALL = 1;
const GRID_PASSABLE = 2;
const STUB_MILLIMETRES = 300;

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
    origin_x: 0,
    origin_y: 0,
    resolution: 50,
    map_data: deflateSync(cells).toString('base64'),
    ...extra,
  });
}

function cellValue(map: MapDocument, cells: Uint8Array, x: number, y: number): number {
  const column = Math.floor((x - map.origin_x) / map.resolution);
  const row = Math.floor((y - map.origin_y) / map.resolution);
  return cells[row * map.width + column] ?? GRID_UNKNOWN;
}

function valuesAcross(
  map: MapDocument,
  cells: Uint8Array,
  segment: readonly number[],
): ReadonlySet<number> {
  const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = segment;
  const length = Math.hypot(x2 - x1, y2 - y1);
  const normalX = (-(y2 - y1) / length) * map.resolution;
  const normalY = ((x2 - x1) / length) * map.resolution;
  const found = new Set<number>();
  for (const step of [-2, -1, 0, 1, 2]) {
    found.add(
      cellValue(map, cells, (x1 + x2) / 2 + normalX * step, (y1 + y2) / 2 + normalY * step),
    );
  }
  return found;
}

describe('synthetic pv11gl map_3d_info lines', () => {
  const map = pv11glMap('current');
  const cells = decodeMapLayer(map, 'map_data');
  const lines = (map.map_3d_info?.rooms ?? []).flatMap((room) => room.lines);
  const ofType = (type: number): typeof lines => lines.filter((line) => line.type === type);
  const decisive = (type: number): typeof lines =>
    ofType(type).filter(
      (line) =>
        Math.hypot(
          (line.segment[2] ?? 0) - (line.segment[0] ?? 0),
          (line.segment[3] ?? 0) - (line.segment[1] ?? 0),
        ) >= STUB_MILLIMETRES,
    );

  it('type 0 is an exterior wall, the grid beside it is unknown space', () => {
    expect(ofType(LINE_EXTERIOR).length).toBeGreaterThan(0);
    for (const line of decisive(LINE_EXTERIOR)) {
      expect(valuesAcross(map, cells, line.segment).has(GRID_UNKNOWN)).toBe(true);
    }
  });

  it('type 2 is an interior wall, a grid wall cell (1) between two rooms', () => {
    expect(ofType(LINE_INTERIOR).length).toBeGreaterThan(0);
    for (const line of decisive(LINE_INTERIOR)) {
      const across = valuesAcross(map, cells, line.segment);
      expect(across.has(GRID_WALL)).toBe(true);
      expect(across.has(GRID_PASSABLE)).toBe(false);
    }
  });

  it('type 1 is an opening, a passable grid cell (2) between two rooms', () => {
    expect(ofType(LINE_OPENING).length).toBeGreaterThan(0);
    for (const line of decisive(LINE_OPENING)) {
      const across = valuesAcross(map, cells, line.segment);
      expect(across.has(GRID_PASSABLE)).toBe(true);
      expect(across.has(GRID_WALL)).toBe(false);
    }
  });

  it('turns every exterior and interior line into one wall in metres and leaves openings out', () => {
    const walls = buildWalls(map);
    expect(walls).toHaveLength(ofType(LINE_EXTERIOR).length + ofType(LINE_INTERIOR).length);
    expect(walls.filter((wall) => wall.kind === 'exterior')).toHaveLength(
      ofType(LINE_EXTERIOR).length,
    );
    expect(walls.filter((wall) => wall.kind === 'interior')).toHaveLength(
      ofType(LINE_INTERIOR).length,
    );
    const first = ofType(LINE_EXTERIOR)[0]?.segment ?? [];
    expect(walls.find((wall) => wall.kind === 'exterior')).toEqual({
      from: { x: (first[0] ?? 0) / 1000, y: (first[1] ?? 0) / 1000 },
      to: { x: (first[2] ?? 0) / 1000, y: (first[3] ?? 0) / 1000 },
      kind: 'exterior',
      height: null,
    });
  });

  it('turns openings into doors that name the two rooms they join, one per opening', () => {
    const doors = buildDoors(map, cells);
    expect(doors.length).toBeGreaterThan(0);
    expect(doors.length).toBeLessThan(ofType(LINE_OPENING).length);
    for (const door of doors) {
      expect(door.kind).toBe('opening');
      expect(door.rooms).toHaveLength(2);
      expect(door.rooms[0]).toBeLessThan(door.rooms[1] ?? 0);
    }
  });

  it('takes the carpet outline and identity from the map carpets', () => {
    const carpets = buildCarpets(map);
    expect(carpets).toHaveLength(map.carpets?.length ?? 0);
    expect(carpets[0]).toEqual({
      id: 0,
      kind: 'ai',
      ring: [
        { x: 0.5, y: 1.5 },
        { x: 2.5, y: 1.5 },
        { x: 2.5, y: 2.5 },
        { x: 0.5, y: 2.5 },
      ],
    });
  });

  it('keeps the domain scene contract with the walls layer in place', () => {
    const base = buildVacuumScene({
      map,
      index: 1,
      slot: 'current',
      fetchedAt: '2026-10-24T10:00:00.000Z',
    });
    const scene = { ...base, ...buildWallsLayer(map, cells, NO_PUSHED_MAP_OBJECTS) };
    expect(VACUUM_SCENE.parse(scene)).toEqual(scene);
    expect(scene.walls.length).toBeGreaterThan(0);
    expect(scene.doors.length).toBeGreaterThan(0);
    expect(scene.carpets).toHaveLength(1);
    expect([scene.zones, scene.furniture, scene.objects]).toEqual([[], [], []]);
  });
});

describe('synthetic wall layouts', () => {
  const rows = ['3333.444', '3333.444', '3333.444', '3333.444'];

  it('merges the two sides of one opening into a single door', () => {
    const map = documentOf(['33333444444', '33333444444', '33333444444', '33333444444'], {
      map_3d_info: {
        rooms: [
          { room_id: 3, lines: [{ type: 1, update: 0, segment: [250, 0, 250, 200] }] },
          { room_id: 4, lines: [{ type: 1, update: 0, segment: [300, 0, 300, 200] }] },
        ],
      },
    });
    const cells = decodeMapLayer(map, 'map_data');
    expect(buildDoors(map, cells)).toEqual([
      { from: { x: 0.25, y: 0 }, to: { x: 0.25, y: 0.2 }, kind: 'opening', rooms: [3, 4] },
    ]);
  });

  it('keeps two openings that are far apart', () => {
    const map = documentOf(rows, {
      map_3d_info: {
        rooms: [
          {
            room_id: 3,
            lines: [
              { type: 1, update: 0, segment: [150, 0, 150, 50] },
              { type: 1, update: 0, segment: [150, 150, 150, 200] },
            ],
          },
        ],
      },
    });
    expect(buildDoors(map, decodeMapLayer(map, 'map_data'))).toHaveLength(2);
  });

  it('leaves line types that are not decided out of walls and doors', () => {
    const map = documentOf(rows, {
      map_3d_info: {
        rooms: [{ room_id: 3, lines: [{ type: 9, update: 0, segment: [0, 0, 100, 0] }] }],
      },
    });
    expect(buildWalls(map)).toEqual([]);
    expect(buildDoors(map, decodeMapLayer(map, 'map_data'))).toEqual([]);
  });

  it('returns nothing for a map without 3D info or carpets', () => {
    const map = documentOf(rows);
    expect(buildWallsLayer(map, decodeMapLayer(map, 'map_data'), NO_PUSHED_MAP_OBJECTS)).toEqual({
      walls: [],
      doors: [],
      carpets: [],
      furniture: [],
      objects: [],
      zones: [],
    });
  });

  it('reads the carpet id and kind from the d code, user drawn 1 and AI detected 2', () => {
    const square = [0, 0, 0, 100, 100, 100, 100, 0];
    const map = documentOf(rows, {
      carpets: [
        { p: square, d: '7_10002' },
        { p: square, d: '3_20001' },
        { p: square, d: 'odd' },
        { p: [0, 0, 100, 100], d: '1_10000' },
      ],
    });
    expect(buildCarpets(map).map(({ id, kind }) => ({ id, kind }))).toEqual([
      { id: 7, kind: 'user' },
      { id: 3, kind: 'ai' },
      { id: 2, kind: 'unknown' },
    ]);
  });
});

describe('zones from the pushed 2.13, 2.14 and 2.103 values', () => {
  it('maps no-go and no-mop areas, virtual walls and hidden zones to metre points', () => {
    const areas = decodeRestrictedAreas(
      '{"forbidden_regions":[{"id":0,"fb_point":[-3260,2725,-3260,725,-1260,725,-1260,2725],"fb_attr":0},{"id":1,"fb_point":[0,0,0,1000,1000,1000,1000,0],"fb_attr":1}]}',
    );
    const walls = decodeVirtualWalls(
      '{"restricted_walls":[{"id":0,"wall_points":[-1265,4165,1225,4165]}]}',
    );
    const hidden = decodeHiddenZones('{"zones":[{"id":0,"points":[0,0,0,500,500,500,500,0]}]}');
    const zones = buildZones({
      ...NO_PUSHED_MAP_OBJECTS,
      restrictedAreas: areas,
      virtualWalls: walls,
      hiddenZones: hidden,
    });
    expect(zones.map(({ id, kind, points }) => ({ id, kind, count: points.length }))).toEqual([
      { id: 0, kind: 'no_go', count: 4 },
      { id: 1, kind: 'no_mop', count: 4 },
      { id: 0, kind: 'wall', count: 2 },
      { id: 0, kind: 'hidden', count: 4 },
    ]);
    expect(zones[0]?.points[0]).toEqual({ x: -3.26, y: 2.725 });
    expect(zones[2]?.points).toEqual([
      { x: -1.265, y: 4.165 },
      { x: 1.225, y: 4.165 },
    ]);
  });

  it('reads the hidden zone value in the written form and in the live singular form', () => {
    expect(decodeHiddenZones('{"zone":[]}')).toEqual([]);
    expect(decodeHiddenZones('{"zones":[]}')).toEqual([]);
    expect(decodeHiddenZones('{"zone":[{"id":2,"points":[0,0,0,1,1,1,1,0]}]}')).toHaveLength(1);
  });

  it('refuses malformed pushed values with a named error', () => {
    expect(() => decodeHiddenZones('nonsense')).toThrow(VacuumCodecError);
    expect(() => decodeHiddenZones('{"zones":[{"id":0,"points":[1,2]}]}')).toThrow(
      VacuumCodecError,
    );
    expect(() => decodeSills('{}')).toThrow(VacuumCodecError);
    expect(() => decodeFurniture('[{"id":1}]')).toThrow(VacuumCodecError);
    expect(() => decodeAiObjects('{"id":1}')).toThrow(VacuumCodecError);
  });
});

describe('sills, furniture and AI objects from the plugin formats (live-unconfirmed except 2.56)', () => {
  it('maps sills to doors of kind sill without rooms', () => {
    const sills = decodeSills('{"map_sills":[{"id":0,"sill_points":[1000,2000,1500,2000]}]}');
    expect(buildSills(sills)).toEqual([
      { from: { x: 1, y: 2 }, to: { x: 1.5, y: 2 }, kind: 'sill', rooms: [] },
    ]);
  });

  it('names furniture by its model id and keeps the four corners', () => {
    const items = decodeFurniture(
      '[{"id":4,"type":1220,"update":1,"pos":[0,0,0,1000,2000,1000,2000,0]},{"id":5,"type":9999,"pos":[0,0,0,100,100,100,100,0]}]',
    );
    const furniture = buildFurniture(items);
    expect(furniture.map(({ id, kind, height }) => ({ id, kind, height }))).toEqual([
      { id: 4, kind: 'triple_seat', height: null },
      { id: 5, kind: 'furniture_9999', height: null },
    ]);
    expect(furniture[0]?.ring).toHaveLength(4);
  });

  it('places AI objects in metres with the class name from the live 2.56 example', () => {
    const items = decodeAiObjects(
      '[{"id":0,"type":3030,"pos_x":-199,"pos_y":599,"confirm":1},{"id":1,"type":1,"pos_x":10,"pos_y":20}]',
    );
    expect(buildObjects(items)).toEqual([
      { id: 0, kind: 'base', at: { x: -0.199, y: 0.599 }, label: 'Base' },
      { id: 1, kind: 'object_1', at: { x: 0.01, y: 0.02 }, label: null },
    ]);
  });

  it('puts pushed sills, furniture and objects into the walls layer', () => {
    const map = documentOf(['333', '333']);
    const layer = buildWallsLayer(map, decodeMapLayer(map, 'map_data'), {
      ...NO_PUSHED_MAP_OBJECTS,
      sills: decodeSills('{"map_sills":[{"id":0,"sill_points":[0,0,50,0]}]}'),
      furniture: decodeFurniture('[{"id":1,"type":1100,"pos":[0,0,0,50,50,50,50,0]}]'),
      aiObjects: decodeAiObjects('[{"id":2,"type":3010,"pos_x":0,"pos_y":0}]'),
    });
    expect(layer.doors.map((door) => door.kind)).toEqual(['sill']);
    expect(layer.furniture.map((item) => item.kind)).toEqual(['single_bed']);
    expect(layer.objects.map((item) => item.kind)).toEqual(['shoes']);
  });
});
