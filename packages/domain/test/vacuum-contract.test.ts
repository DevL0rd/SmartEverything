import { describe, expect, it } from 'vitest';
import {
  API_ENDPOINTS,
  UNRECORDED_RAW_CAPABILITIES,
  VACUUM_AREAS_EDIT,
  VACUUM_CLEAN,
  VACUUM_MAP_KEY,
  VACUUM_POSE_KEY,
  VACUUM_FAULT_KEY,
  VACUUM_ROOM_LINKS_KEY,
  VACUUM_ROOM_LINK_SET,
  VACUUM_SCENE_ANSWER,
  parseVacuumFault,
  vacuumFaultText,
  VACUUM_RESTRICTED_LIMIT,
  VACUUM_ROOM_EDIT,
  VACUUM_SCENE,
  isSampledCapability,
  isUnrecordedCapability,
  mcpToolOperation,
  vacuumSceneVersion,
} from '../src';

const POINT = { x: 1.5, y: -2 };
const RING = [POINT, { x: 2, y: -2 }, { x: 2, y: -1 }];
const AREA = [POINT, { x: 2, y: -2 }, { x: 2, y: -1 }, { x: 1, y: -1 }];

const SCENE = {
  index: 101,
  slot: 'current',
  name: null,
  fetchedAt: '2026-10-24T10:00:00Z',
  bounds: { minX: -6, minY: -2, maxX: 3, maxY: 6 },
  rooms: [
    {
      id: 3,
      name: 'Kitchen',
      colour: 1,
      floor: 0,
      hidden: false,
      areaM2: 9.5,
      label: POINT,
      rings: [RING],
      settings: null,
    },
  ],
  walls: [{ from: POINT, to: { x: 2, y: 2 }, kind: 'wall', height: null }],
  doors: [{ from: POINT, to: { x: 2, y: 2 }, kind: 'opening', rooms: [3, 4] }],
  carpets: [{ id: 1, kind: 'rect', ring: RING }],
  furniture: [],
  objects: [],
  zones: [{ id: 1, kind: 'no_go', points: AREA }],
  dock: { x: 0, y: 0, yaw: 0 },
  robot: null,
  trail: [{ mopping: false, points: [POINT] }],
};

describe('the vacuum scene', () => {
  it('reads a scene and ignores fields a newer hub adds', () => {
    const parsed = VACUUM_SCENE.parse({
      ...SCENE,
      future: true,
      rooms: [{ ...SCENE.rooms[0], tint: 1 }],
    });
    expect(parsed.rooms[0]?.name).toBe('Kitchen');
    expect('future' in parsed).toBe(false);
    expect(vacuumSceneVersion(parsed)).toBe('101:current');
  });

  it('reads kinds it does not know as plain text and refuses a missing part', () => {
    expect(
      VACUUM_SCENE.safeParse({ ...SCENE, zones: [{ id: 2, kind: 'someday', points: AREA }] })
        .success,
    ).toBe(true);
    expect(VACUUM_SCENE.safeParse({ ...SCENE, bounds: undefined }).success).toBe(false);
    expect(VACUUM_SCENE.safeParse({ ...SCENE, slot: 'archive' }).success).toBe(false);
  });

  it('reads a clean with its path and map index', () => {
    const clean = VACUUM_CLEAN.parse({
      id: 'c1',
      startedAt: '2026-10-24T09:00:00Z',
      endedAt: null,
      seconds: 600,
      areaM2: 12.25,
      scope: 'rooms',
      mode: 'sweep_mop',
      rooms: [{ id: 3, name: 'Kitchen' }],
      outcome: null,
      batteryStart: 90,
      batteryEnd: null,
      mapIndex: 7,
      zones: [],
      trail: [{ mopping: true, points: [POINT] }],
    });
    expect(clean.trail[0]?.mopping).toBe(true);
  });
});

describe('the vacuum endpoints', () => {
  const entries = Object.entries(API_ENDPOINTS);

  it('are registered under unique method and path pairs with unique operation names', () => {
    const keys = entries.map(([, endpoint]) => `${endpoint.method} ${endpoint.path}`);
    expect(new Set(keys).size).toBe(keys.length);
    const vacuum = entries.filter(([, endpoint]) => endpoint.path.startsWith('/api/vacuums/'));
    expect(vacuum.map(([name]) => name).sort()).toStrictEqual([
      'closeVacuumVideo',
      'editVacuumAreas',
      'getVacuumClean',
      'getVacuumScene',
      'listVacuumCleans',
      'listVacuumRoomLinks',
      'openVacuumVideo',
      'removeVacuumRoomLink',
      'setVacuumRoomLink',
      'setVacuumRoomSettings',
    ]);
  });

  it('are reachable by the AI as named operations', () => {
    expect(mcpToolOperation('read_vacuum_scene')).toBe('getVacuumScene');
    expect(mcpToolOperation('list_vacuum_cleans')).toBe('listVacuumCleans');
    expect(mcpToolOperation('read_vacuum_clean')).toBe('getVacuumClean');
    expect(mcpToolOperation('edit_vacuum_areas')).toBe('editVacuumAreas');
    expect(mcpToolOperation('update_vacuum_room')).toBe('setVacuumRoomSettings');
    expect(mcpToolOperation('list_vacuum_room_links')).toBe('listVacuumRoomLinks');
    expect(mcpToolOperation('link_vacuum_room')).toBe('setVacuumRoomLink');
    expect(mcpToolOperation('unlink_vacuum_room')).toBe('removeVacuumRoomLink');
  });

  it('default the scene slot to the live map', () => {
    expect(API_ENDPOINTS.getVacuumScene.query.parse({})).toStrictEqual({ slot: 'current' });
    expect(API_ENDPOINTS.getVacuumScene.query.safeParse({ slot: 'x' }).success).toBe(false);
  });

  it('limit the restricted areas and walls the robot can hold', () => {
    const full = { noGo: Array.from({ length: VACUUM_RESTRICTED_LIMIT }, () => AREA) };
    expect(VACUUM_AREAS_EDIT.safeParse(full).success).toBe(true);
    expect(
      VACUUM_AREAS_EDIT.safeParse({ ...full, walls: [{ from: POINT, to: { x: 3, y: 3 } }] })
        .success,
    ).toBe(false);
    expect(VACUUM_AREAS_EDIT.safeParse({ noGo: [RING] }).success).toBe(false);
    expect(VACUUM_AREAS_EDIT.safeParse({}).success).toBe(true);
  });

  it('take a room edit with at least one change', () => {
    expect(VACUUM_ROOM_EDIT.safeParse({}).success).toBe(false);
    expect(VACUUM_ROOM_EDIT.safeParse({ hidden: true }).success).toBe(true);
    expect(VACUUM_ROOM_EDIT.safeParse({ name: 'Pantry' }).success).toBe(false);
    expect(VACUUM_ROOM_EDIT.safeParse({ name: 'Pantry', floor: 4010 }).success).toBe(false);
  });
});

describe('the history exclusion', () => {
  it('keeps the map version and the pose out of the state history through one registry', () => {
    expect([...UNRECORDED_RAW_CAPABILITIES].sort()).toStrictEqual(
      [VACUUM_MAP_KEY, VACUUM_POSE_KEY, VACUUM_FAULT_KEY, VACUUM_ROOM_LINKS_KEY].sort(),
    );
    expect(isUnrecordedCapability('raw:vacuum_pose')).toBe(true);
    expect(isUnrecordedCapability('raw:vacuum_map')).toBe(true);
    expect(isUnrecordedCapability('raw:vacuum_fault')).toBe(true);
    expect(isUnrecordedCapability('raw:vacuum_room_links')).toBe(true);
    expect(isUnrecordedCapability('raw:2.2')).toBe(false);
    expect(isUnrecordedCapability('battery')).toBe(false);
    expect(isSampledCapability(VACUUM_POSE_KEY)).toBe(false);
  });
});

describe('the active fault value', () => {
  it('round trips and is read leniently', () => {
    const text = vacuumFaultText({
      code: 100052,
      title: 'Cliff sensor dirty',
      hint: 'Wipe it',
      canHelp: true,
      since: '2026-10-24T10:00:00.000Z',
    });
    expect(parseVacuumFault(text)).toStrictEqual({
      code: 100052,
      title: 'Cliff sensor dirty',
      hint: 'Wipe it',
      canHelp: true,
      since: '2026-10-24T10:00:00.000Z',
    });
    expect(parseVacuumFault('{"code":7,"extra":1}')).toMatchObject({
      code: 7,
      title: '',
      hint: '',
      canHelp: false,
    });
  });

  it('treats a missing, empty or unreadable value as no fault', () => {
    expect(parseVacuumFault(undefined)).toBeNull();
    expect(parseVacuumFault(vacuumFaultText(null))).toBeNull();
    expect(parseVacuumFault('not json')).toBeNull();
    expect(parseVacuumFault('{"title":"x"}')).toBeNull();
    expect(parseVacuumFault(5)).toBeNull();
  });
});

describe('the room link contract', () => {
  it('takes a strict link body with move off unless sent', () => {
    const roomId = '00000000-0000-4000-8000-000000000001';
    expect(VACUUM_ROOM_LINK_SET.parse({ roomId })).toStrictEqual({ roomId, move: false });
    expect(VACUUM_ROOM_LINK_SET.safeParse({ roomId, extra: 1 }).success).toBe(false);
    expect(VACUUM_ROOM_LINK_SET.safeParse({ roomId: 'kitchen' }).success).toBe(false);
  });

  it('reads a scene answer without the link fields an older hub leaves out', () => {
    const scene = {
      index: 1,
      slot: 'current',
      name: null,
      fetchedAt: '2026-10-24T08:00:00.000Z',
      bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
      rooms: [],
      walls: [],
      doors: [],
      carpets: [],
      furniture: [],
      objects: [],
      zones: [],
      dock: null,
      robot: null,
      trail: [],
    };
    expect(VACUUM_SCENE_ANSWER.parse(scene).unlinkedRooms).toBeUndefined();
  });
});
