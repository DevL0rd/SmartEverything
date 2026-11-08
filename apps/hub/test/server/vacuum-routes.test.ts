import {
  API_ENDPOINTS,
  VACUUM_AREAS_RESULT,
  VACUUM_CLEAN,
  type CapabilityKey,
  type JsonValue,
  type VacuumClean,
  type VacuumCleanSummary,
  type VacuumScene,
  type VacuumSlot,
  type VacuumVideoOpening,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Caller } from '../../src/server/auth';
import {
  vacuumRoutes,
  type VacuumControl,
  type VacuumRouteServices,
} from '../../src/server/handlers/vacuums';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';
import { sceneOf } from '../vacuum/clean-bench';
import { fixtureRoom, sceneWith } from '../vacuum/room-link-bench';
import { VacuumRoomLinks } from '../../src/vacuum/room-links';

const AREAS = 'raw:2.13';
const WALLS = 'raw:2.14';
const ROOMS = 'raw:2.16';

const ROOM_LIST = JSON.stringify({
  room_attrs: [
    { id: 3, room_name: 'Kitchen', floor: 0 },
    { id: 4, room_name: 'Hall', floor: 0 },
  ],
});

const READ_AREAS = JSON.stringify({
  forbidden_regions: [
    { id: 0, fb_point: [-1000, 2000, -1000, 1000, 500, 1000, 500, 2000], fb_attr: 0 },
    { id: 1, fb_point: [0, 0, 0, -1000, 1000, -1000, 1000, 0], fb_attr: 1 },
  ],
});

const READ_WALLS = JSON.stringify({
  restricted_walls: [{ id: 0, wall_points: [-1265, 4165, 1225, 4165] }],
});

const SQUARE = [
  { x: 2, y: 3 },
  { x: 2, y: 2 },
  { x: 3, y: 2 },
  { x: 3, y: 3 },
];

interface Sent {
  readonly properties: readonly {
    readonly siid: number;
    readonly piid: number;
    readonly value: JsonValue;
  }[];
  readonly action: readonly { readonly piid: number; readonly value: JsonValue }[] | null;
}

class Rig {
  readonly values = new Map<string, JsonValue>([
    [AREAS, READ_AREAS],
    [WALLS, READ_WALLS],
    [ROOMS, ROOM_LIST],
  ]);
  readonly sent: Sent[] = [];
  readonly ensured: string[] = [];
  readonly scenes = new Map<string, VacuumScene>();
  readonly cleans = new Map<string, VacuumClean>();
  readonly listed: unknown[] = [];
  readonly published = new Map<string, JsonValue>();

  services(opened: TestStore): VacuumRouteServices {
    const control: VacuumControl = {
      value: (_deviceId, key: CapabilityKey) => this.values.get(key),
      run: (_deviceId, command): Promise<void> => {
        this.sent.push({
          properties: command.properties,
          action: command.action === null ? null : command.action.in,
        });
        return Promise.resolve();
      },
    };
    return {
      devices: opened.store.devices,
      scenes: {
        latest: (deviceId, slot) => this.scenes.get(`${deviceId}|${slot}`),
        robotMap: () => undefined,
      },
      maps: {
        ensure: (deviceId: string, slot: VacuumSlot): Promise<void> => {
          this.ensured.push(`${deviceId}|${slot}`);
          return Promise.resolve();
        },
      },
      cleans: {
        list: (_deviceId, query): VacuumCleanSummary[] => {
          this.listed.push(query);
          return [...this.cleans.values()];
        },
        get: (_deviceId, id) => this.cleans.get(id),
      },
      control,
      video: {
        open: (): Promise<VacuumVideoOpening> => Promise.resolve({ status: 'no_reply' }),
        close: (): Promise<void> => Promise.resolve(),
      },
      roomLinks: new VacuumRoomLinks({
        links: opened.store.vacuumRoomLinks,
        rooms: opened.store.rooms,
        scene: (deviceId): VacuumScene | undefined => this.scenes.get(`${deviceId}|current`),
        stored: (deviceId): JsonValue | undefined => this.published.get(deviceId),
        publish: (deviceId, text): void => {
          this.published.set(deviceId, text);
        },
        log: testLogger(),
      }),
    };
  }
}

let opened: TestStore;
let caller: Caller;
let rig: Rig;
let robotId: string;
let lampId: string;

function device(
  provider: 'xiaomi' | 'smartthings',
  externalId: string,
  kind: 'vacuum' | 'light',
): string {
  const [row] = opened.store.devices.upsert([
    {
      provider,
      externalId,
      parentId: null,
      kind,
      name: externalId,
      model: 'm',
      manufacturer: 'm',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  return row?.id ?? '';
}

async function call(
  name: keyof ReturnType<typeof vacuumRoutes>,
  input: { params: unknown; query?: unknown; body?: unknown },
): Promise<unknown> {
  const routes = vacuumRoutes(rig.services(opened));
  return routes[name].run(
    caller,
    {
      params: input.params,
      query: input.query ?? {},
      body: input.body,
      remote: 'test',
      headers: {},
    },
    testLogger(),
  );
}

beforeEach(async () => {
  opened = await testStore();
  const client = opened.store.clients.create(
    { name: 'Owner', platform: 'desktop', role: 'owner', tokenHash: 'd'.repeat(64) },
    true,
  );
  caller = { kind: 'client', client };
  rig = new Rig();
  robotId = device('xiaomi', 'robot', 'vacuum');
  lampId = device('xiaomi', 'lamp', 'light');
});

afterEach(async () => {
  await opened.close();
});

describe('the scene route', () => {
  it('answers the cached scene with its index as the version', async () => {
    rig.scenes.set(`${robotId}|current`, sceneOf(41));
    await expect(call('getVacuumScene', { params: { deviceId: robotId } })).resolves.toMatchObject({
      index: 41,
      slot: 'current',
    });
    expect(rig.ensured).toStrictEqual([]);
  });

  it('tags the scene answer with its map index so an unchanged map is not sent again', async () => {
    rig.scenes.set(`${robotId}|current`, sceneOf(41));
    const route = vacuumRoutes(rig.services(opened)).getVacuumScene;
    const scene = await call('getVacuumScene', { params: { deviceId: robotId } });
    expect(route.entityTag?.(scene)).toMatch(/^41-[0-9a-f]{12}$/u);
  });

  it('asks the map service for one fetch when nothing is cached and answers what it stored', async () => {
    const answer = call('getVacuumScene', {
      params: { deviceId: robotId },
      query: { slot: 'saved' },
    });
    rig.scenes.set(`${robotId}|saved`, { ...sceneOf(7), slot: 'saved' });
    await expect(answer).resolves.toMatchObject({ index: 7, slot: 'saved' });
    expect(rig.ensured).toStrictEqual([`${robotId}|saved`]);
  });

  it('answers not found when the fetch produced no scene', async () => {
    await expect(call('getVacuumScene', { params: { deviceId: robotId } })).rejects.toMatchObject({
      code: 'not_found',
    });
    expect(rig.ensured).toStrictEqual([`${robotId}|current`]);
  });

  it('refuses a device that is not a robot vacuum', async () => {
    await expect(call('getVacuumScene', { params: { deviceId: lampId } })).rejects.toMatchObject({
      code: 'invalid_request',
    });
  });
});

describe('the clean routes', () => {
  const clean = VACUUM_CLEAN.parse({
    id: 'c1',
    startedAt: '2026-10-24T08:00:00.000Z',
    endedAt: '2026-10-24T08:30:00.000Z',
    seconds: 1800,
    areaM2: 12,
    scope: 'rooms',
    mode: 'sweep',
    rooms: [{ id: 3, name: 'Kitchen' }],
    outcome: 'finished',
    batteryStart: 90,
    batteryEnd: 70,
    mapIndex: 5,
    zones: [],
    trail: [{ mopping: false, points: [{ x: 0, y: 0 }] }],
  });

  it('lists the finished cleans and passes the before moment and limit on', async () => {
    rig.cleans.set('c1', clean);
    const page = await call('listVacuumCleans', {
      params: { deviceId: robotId },
      query: { before: '2026-10-25T00:00:00.000Z', limit: '5' },
    });
    expect(page).toMatchObject({ cleans: [{ id: 'c1', rooms: [{ id: 3, name: 'Kitchen' }] }] });
    expect(rig.listed).toStrictEqual([{ to: '2026-10-25T00:00:00.000Z', limit: 5 }]);
  });

  it('reads one clean with its trajectory and map index, or says it is unknown', async () => {
    rig.cleans.set('c1', clean);
    await expect(
      call('getVacuumClean', { params: { deviceId: robotId, cleanId: 'c1' } }),
    ).resolves.toMatchObject({ mapIndex: 5, trail: [{ points: [{ x: 0, y: 0 }] }] });
    await expect(
      call('getVacuumClean', { params: { deviceId: robotId, cleanId: 'missing' } }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('the areas route', () => {
  it('returns the previous areas in metres and writes both lists in millimetres', async () => {
    const result = await call('editVacuumAreas', {
      params: { deviceId: robotId },
      body: { noGo: [SQUARE] },
    });
    expect(result).toStrictEqual({
      previous: {
        noGo: [
          [
            { x: -1, y: 2 },
            { x: -1, y: 1 },
            { x: 0.5, y: 1 },
            { x: 0.5, y: 2 },
          ],
        ],
        noMop: [
          [
            { x: 0, y: 0 },
            { x: 0, y: -1 },
            { x: 1, y: -1 },
            { x: 1, y: 0 },
          ],
        ],
        walls: [{ from: { x: -1.265, y: 4.165 }, to: { x: 1.225, y: 4.165 } }],
      },
    });
    expect(rig.sent).toHaveLength(1);
    expect(rig.sent[0]?.action).toBeNull();
    expect(rig.sent[0]?.properties).toStrictEqual([
      {
        siid: 2,
        piid: 13,
        value: JSON.stringify({
          forbidden_regions: [
            { id: 0, fb_point: [2000, 3000, 2000, 2000, 3000, 2000, 3000, 3000], fb_attr: 0 },
            { id: 1, fb_point: [0, 0, 0, -1000, 1000, -1000, 1000, 0], fb_attr: 1 },
          ],
        }),
      },
      { siid: 2, piid: 14, value: READ_WALLS },
    ]);
  });

  it('undoes an edit by sending the previous areas back', async () => {
    const edited = await call('editVacuumAreas', {
      params: { deviceId: robotId },
      body: { noGo: [SQUARE], walls: [] },
    });
    rig.sent.length = 0;
    const { previous } = VACUUM_AREAS_RESULT.parse(edited);
    await call('editVacuumAreas', { params: { deviceId: robotId }, body: previous });
    expect(rig.sent[0]?.properties.map((write) => write.value)).toStrictEqual([
      READ_AREAS,
      READ_WALLS,
    ]);
  });

  it('refuses a total over the robot limit without writing anything', async () => {
    const eleven = Array.from({ length: 11 }, () => SQUARE);
    await expect(
      call('editVacuumAreas', { params: { deviceId: robotId }, body: { noGo: eleven } }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    expect(rig.sent).toStrictEqual([]);
  });

  it('refuses when the combined lists exceed the limit and when the robot has not reported', async () => {
    const nine = Array.from({ length: 9 }, () => SQUARE);
    await expect(
      call('editVacuumAreas', { params: { deviceId: robotId }, body: { noGo: nine } }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    rig.values.delete(AREAS);
    await expect(
      call('editVacuumAreas', { params: { deviceId: robotId }, body: { noGo: [] } }),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(rig.sent).toStrictEqual([]);
  });

  it('refuses a robot that is not a Xiaomi vacuum', async () => {
    const other = device('smartthings', 'st-robot', 'vacuum');
    await expect(
      call('editVacuumAreas', { params: { deviceId: other }, body: { noGo: [] } }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
  });
});

describe('the room settings route', () => {
  const ROOM = { deviceId: '', mapRoomId: '3' };

  it('sets the floor and hides through the proven room attribute action', async () => {
    await call('setVacuumRoomSettings', {
      params: { ...ROOM, deviceId: robotId },
      body: { floor: 4010, hidden: true },
    });
    expect(rig.sent.map((sent) => sent.action)).toStrictEqual([
      [{ piid: 16, value: JSON.stringify({ room_attrs: [{ id: 3, floor: 4010 }] }) }],
      [{ piid: 16, value: JSON.stringify({ room_attrs: [{ id: 3, notshow: 1 }] }) }],
    ]);
    expect(rig.sent.every((sent) => sent.properties.length === 0)).toBe(true);
  });

  it('refuses a name, since a map room shows the name of its linked home room', async () => {
    await expect(
      call('setVacuumRoomSettings', {
        params: { ...ROOM, deviceId: robotId },
        body: { name: 'Pantry' },
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    expect(rig.sent).toStrictEqual([]);
  });

  it('refuses an unknown floor material and an unknown room before sending anything', async () => {
    await expect(
      call('setVacuumRoomSettings', {
        params: { ...ROOM, deviceId: robotId },
        body: { floor: 7 },
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    await expect(
      call('setVacuumRoomSettings', {
        params: { deviceId: robotId, mapRoomId: '99' },
        body: { hidden: false },
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    rig.values.delete(ROOMS);
    await expect(
      call('setVacuumRoomSettings', {
        params: { ...ROOM, deviceId: robotId },
        body: { hidden: false },
      }),
    ).rejects.toMatchObject({ name: 'CommandRefusedError' });
    expect(rig.sent).toStrictEqual([]);
  });
});

describe('the room link routes', () => {
  const FIRST = fixtureRoom(0);
  const SECOND = fixtureRoom(1);

  beforeEach(() => {
    rig.scenes.set(`${robotId}|current`, sceneWith(20, [FIRST, SECOND]));
  });

  it('list the map rooms with name suggestions and every home room, linking nothing', async () => {
    const named = opened.store.rooms.create(FIRST.name, 0);
    const links = API_ENDPOINTS.listVacuumRoomLinks.response.parse(
      await call('listVacuumRoomLinks', { params: { deviceId: robotId } }),
    );
    expect(links.mapIndex).toBe(20);
    expect(links.rooms.map((room) => [room.mapRoomId, room.suggestion?.id ?? null])).toStrictEqual([
      [FIRST.id, named.id],
      [SECOND.id, null],
    ]);
    expect(links.homeRooms).toStrictEqual([{ id: named.id, name: FIRST.name, usedBy: null }]);
    expect(links.unlinked).toBe(2);
  });

  it('link a map room, report the home room as used and carry the link in the scene', async () => {
    const kitchen = opened.store.rooms.create('Kitchen', 0);
    const before = await call('getVacuumScene', { params: { deviceId: robotId } });
    const linked = API_ENDPOINTS.setVacuumRoomLink.response.parse(
      await call('setVacuumRoomLink', {
        params: { deviceId: robotId, mapRoomId: String(FIRST.id) },
        body: { roomId: kitchen.id },
      }),
    );
    expect(linked.homeRooms[0]?.usedBy).toStrictEqual({
      mapRoomId: FIRST.id,
      mapRoomName: FIRST.name,
      stale: false,
    });
    const scene = API_ENDPOINTS.getVacuumScene.response.parse(
      await call('getVacuumScene', { params: { deviceId: robotId } }),
    );
    expect(scene.rooms.map((room) => room.homeRoom?.name ?? null)).toStrictEqual(['Kitchen', null]);
    expect(scene.unlinkedRooms).toBe(1);
    const route = vacuumRoutes(rig.services(opened)).getVacuumScene;
    expect(route.entityTag?.(scene)).not.toBe(route.entityTag?.(before));
  });

  it('refuse a used home room unless move is sent, then move the link', async () => {
    const kitchen = opened.store.rooms.create('Kitchen', 0);
    const link = (mapRoomId: number, move?: boolean): Promise<unknown> =>
      call('setVacuumRoomLink', {
        params: { deviceId: robotId, mapRoomId: String(mapRoomId) },
        body: move === undefined ? { roomId: kitchen.id } : { roomId: kitchen.id, move },
      });
    await link(FIRST.id);
    await expect(link(SECOND.id)).rejects.toMatchObject({ code: 'conflict' });
    const moved = API_ENDPOINTS.setVacuumRoomLink.response.parse(await link(SECOND.id, true));
    expect(moved.rooms.map((room) => room.homeRoom?.id ?? null)).toStrictEqual([null, kitchen.id]);
  });

  it('refuse unknown body fields before linking anything', async () => {
    const kitchen = opened.store.rooms.create('Kitchen', 0);
    await expect(
      call('setVacuumRoomLink', {
        params: { deviceId: robotId, mapRoomId: String(FIRST.id) },
        body: { roomId: kitchen.id, force: true },
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    expect(opened.store.vacuumRoomLinks.list(robotId)).toStrictEqual([]);
  });

  it('remove a link and refuse a device that is not a robot vacuum', async () => {
    const kitchen = opened.store.rooms.create('Kitchen', 0);
    await call('setVacuumRoomLink', {
      params: { deviceId: robotId, mapRoomId: String(FIRST.id) },
      body: { roomId: kitchen.id },
    });
    const removed = API_ENDPOINTS.removeVacuumRoomLink.response.parse(
      await call('removeVacuumRoomLink', {
        params: { deviceId: robotId, mapRoomId: String(FIRST.id) },
      }),
    );
    expect(removed.unlinked).toBe(2);
    await expect(
      call('listVacuumRoomLinks', { params: { deviceId: lampId } }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
  });
});
