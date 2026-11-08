import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as domain from '../src/index';
import { VACUUM_ROOM_EDIT } from '../src/api/endpoints-vacuums';
import {
  HOME_MAP_ROBOT_FURNITURE_MODEL_IDS,
  HOME_MAP_SOURCE_GEOMETRY,
  homeMapRobotFloor,
  homeMapRobotFloorCode,
  homeMapRobotFurnitureModel,
  isHomeMapVacuumSettled,
  vacuumSceneToSourceGeometry,
} from '../src/home-map-vacuum-source';
import { homeMapPolygonArea, homeMapRingArea } from '../src/home-map-geometry';
import { VACUUM_SCENE, type VacuumScene } from '../src/vacuum-scene';
import { VACUUM_PHASES, VACUUM_TASK_PHASES } from '../src/vacuum-status';

const fixture: VacuumScene = VACUUM_SCENE.parse(
  JSON.parse(readFileSync(new URL('./fixtures/vacuum-scene-pv11gl.json', import.meta.url), 'utf8')),
);

type Ring = VacuumScene['carpets'][number]['ring'];

const square = (x: number, y: number, size: number, counterClockwise = true): Ring => {
  const ring = [
    { x, y },
    { x: x + size, y },
    { x: x + size, y: y + size },
    { x, y: y + size },
  ];
  return counterClockwise ? ring : ring.toReversed();
};

const room = (
  id: number,
  rings: VacuumScene['rooms'][number]['rings'],
  floor = 0,
): VacuumScene['rooms'][number] => ({
  id,
  name: `Room ${String(id)}`,
  colour: 1,
  floor,
  hidden: false,
  areaM2: 1,
  label: { x: 0.5, y: 0.5 },
  rings,
  settings: null,
});

const sceneWith = (patch: Partial<VacuumScene>): VacuumScene => ({ ...fixture, ...patch });

describe('the synthetic pv11gl scene as a source geometry', () => {
  const geometry = vacuumSceneToSourceGeometry(fixture);

  it('is a valid source geometry that keeps the scene version and frame facts', () => {
    expect(HOME_MAP_SOURCE_GEOMETRY.safeParse(geometry).success).toBe(true);
    expect(geometry.version).toBe('101:current');
    expect(geometry.frame).toEqual({
      uid: null,
      name: 'Fixture',
      boundsSignature: '-0.90,-0.90,9.75,5.15',
    });
    expect(geometry.dock).toEqual(fixture.dock);
  });

  it('keeps every room with its robot id as ref, its shape in metres y up and its floor int', () => {
    expect(geometry.rooms.map((entry) => entry.ref)).toEqual(['3', '4', '5', '6', '8']);
    for (const entry of geometry.rooms) {
      const source = fixture.rooms.find((candidate) => String(candidate.id) === entry.ref);
      expect(source).toBeDefined();
      expect(entry.holes).toEqual([]);
      expect(entry.extraParts).toEqual([]);
      expect(entry.floorCode).toBe(source?.floor);
      expect(entry.name).toBe(source?.name);
      expect(homeMapPolygonArea({ outer: entry.ring, holes: entry.holes })).toBeCloseTo(
        homeMapRingArea(source?.rings[0] ?? []),
        9,
      );
    }
  });

  it('carries walls, doors with room refs, carpet rings and no furniture from the scene', () => {
    expect(geometry.walls).toHaveLength(fixture.walls.length);
    expect(new Set(geometry.walls.map((wall) => wall.kind))).toEqual(
      new Set(['exterior', 'interior']),
    );
    expect(geometry.doors).toHaveLength(fixture.doors.length);
    expect(geometry.doors[0]?.rooms).toEqual(['3', '4']);
    expect(geometry.carpets).toHaveLength(1);
    expect(geometry.carpets[0]).toEqual(fixture.carpets[0]?.ring);
    expect(geometry.furniture).toEqual([]);
  });

  it('is pure: the scene is untouched and the same scene gives the same geometry', () => {
    const before = JSON.stringify(fixture);
    expect(vacuumSceneToSourceGeometry(fixture)).toEqual(geometry);
    expect(JSON.stringify(fixture)).toBe(before);
  });

  it('is read leniently: fields a newer hub adds are ignored', () => {
    const parsed = HOME_MAP_SOURCE_GEOMETRY.parse({ ...geometry, future: 1 });
    expect(parsed.rooms).toHaveLength(5);
  });

  it('is exported from the domain index', () => {
    expect(domain.vacuumSceneToSourceGeometry).toBe(vacuumSceneToSourceGeometry);
    expect(domain.HOME_MAP_VACUUM_CAPABILITIES.livePose).toBe(true);
  });
});

describe('room shapes', () => {
  it('splits a ring list into the outer shape and its holes by orientation and containment', () => {
    const scene = sceneWith({
      rooms: [room(1, [square(0, 0, 10), square(2, 2, 2, false), square(6, 6, 2, false)])],
    });
    const [only] = vacuumSceneToSourceGeometry(scene).rooms;
    expect(only?.ring).toEqual(square(0, 0, 10));
    expect(only?.holes).toEqual([square(2, 2, 2, false), square(6, 6, 2, false)]);
    expect(only?.extraParts).toEqual([]);
  });

  it('keeps a second separate part with its own hole instead of dropping it', () => {
    const scene = sceneWith({
      rooms: [
        room(1, [
          square(20, 20, 4),
          square(0, 0, 10),
          square(21, 21, 1, false),
          square(2, 2, 2, false),
        ]),
      ],
    });
    const [only] = vacuumSceneToSourceGeometry(scene).rooms;
    expect(only?.ring).toEqual(square(0, 0, 10));
    expect(only?.holes).toEqual([square(2, 2, 2, false)]);
    expect(only?.extraParts).toEqual([
      { ring: square(20, 20, 4), holes: [square(21, 21, 1, false)] },
    ]);
  });

  it('leaves out a room that has no outer shape', () => {
    const scene = sceneWith({ rooms: [room(1, []), room(2, [square(0, 0, 3)])] });
    expect(vacuumSceneToSourceGeometry(scene).rooms.map((entry) => entry.ref)).toEqual(['2']);
  });
});

describe('the robot floor code and the floor material', () => {
  it('maps the five known codes to materials and back', () => {
    const known = [4000, 4010, 4011, 4020, 4030];
    for (const code of known) {
      const floor = homeMapRobotFloor(code);
      expect(floor.status).toBe('known');
      if (floor.status === 'known') expect(homeMapRobotFloorCode(floor)).toBe(code);
    }
    expect(homeMapRobotFloor(4011)).toEqual({
      status: 'known',
      code: 4011,
      kind: 'wood',
      variant: 'horizontal',
    });
  });

  it('reads 0 as no floor type and keeps an unknown code as its number with a visible label', () => {
    expect(homeMapRobotFloor(0)).toEqual({ status: 'none' });
    expect(homeMapRobotFloor(4999)).toEqual({
      status: 'unknown',
      code: 4999,
      label: 'Robot floor type 4999',
    });
    const [only] = vacuumSceneToSourceGeometry(
      sceneWith({ rooms: [room(1, [square(0, 0, 3)], 4999)] }),
    ).rooms;
    expect(only?.floorCode).toBe(4999);
  });

  it('writes a material to the robot only when the robot knows exactly that material', () => {
    expect(homeMapRobotFloorCode({ kind: 'marble', variant: null })).toBe(4030);
    expect(homeMapRobotFloorCode({ kind: 'wood', variant: 'herringbone' })).toBeNull();
    expect(homeMapRobotFloorCode({ kind: 'carpet', variant: null })).toBeNull();
  });
});

describe('robot furniture and catalogue ids', () => {
  it('maps robot kinds straight to cat ids and keeps unmapped kinds as labelled boxes', () => {
    const scene = sceneWith({
      furniture: [
        { id: 1, kind: 'triple_seat', ring: square(0, 0, 2), height: 0.8 },
        { id: 2, kind: 'u_sofa', ring: square(3, 0, 3), height: null },
        { id: 3, kind: 'furniture_9999', ring: square(7, 0, 1), height: null },
      ],
    });
    const { furniture } = vacuumSceneToSourceGeometry(scene);
    expect(furniture.map((item) => item.modelId)).toEqual(['cat.living.sofa-3-seat', null, null]);
    expect(furniture.map((item) => item.label)).toEqual([
      'Triple seat',
      'U sofa',
      'Furniture 9999',
    ]);
    expect(furniture.map((item) => item.kind)).toEqual(['triple_seat', 'u_sofa', 'furniture_9999']);
    expect(furniture[0]?.height).toBe(0.8);
  });

  it('only produces well formed cat ids and none for appliances, which are devices', () => {
    expect(HOME_MAP_ROBOT_FURNITURE_MODEL_IDS.length).toBeGreaterThan(20);
    for (const id of HOME_MAP_ROBOT_FURNITURE_MODEL_IDS) {
      expect(id).toMatch(/^cat\.[a-z]+\.[a-z0-9]+(-[a-z0-9]+)*$/);
    }
    for (const kind of ['washing_machine', 'air_purifier', 'humidifier', 'heater']) {
      expect(homeMapRobotFurnitureModel(kind)).toBeNull();
    }
  });
});

describe('when a vacuum map is settled', () => {
  it('is settled when the robot is not on a task and unsettled while it works', () => {
    for (const phase of VACUUM_PHASES) {
      const working = VACUUM_TASK_PHASES.includes(phase);
      expect(isHomeMapVacuumSettled({ slot: 'current', phase })).toBe(!working);
    }
    for (const phase of ['idle', 'charging', 'docked_full', 'error'] as const) {
      expect(isHomeMapVacuumSettled({ slot: 'current', phase })).toBe(true);
    }
  });

  it('is unsettled when the phase is unknown and always settled for the saved map', () => {
    expect(isHomeMapVacuumSettled({ slot: 'current', phase: null })).toBe(false);
    expect(isHomeMapVacuumSettled({ slot: 'saved', phase: 'cleaning' })).toBe(true);
    expect(isHomeMapVacuumSettled({ slot: 'saved', phase: null })).toBe(true);
  });
});

describe('what the robot room edit supports', () => {
  it('takes a floor or hidden and refuses a room name', () => {
    expect(VACUUM_ROOM_EDIT.safeParse({ floor: 4030 }).success).toBe(true);
    expect(VACUUM_ROOM_EDIT.safeParse({ hidden: true }).success).toBe(true);
    expect(VACUUM_ROOM_EDIT.safeParse({ name: 'Study' }).success).toBe(false);
    expect(VACUUM_ROOM_EDIT.safeParse({ floor: 4030, name: 'Study' }).success).toBe(false);
  });
});
