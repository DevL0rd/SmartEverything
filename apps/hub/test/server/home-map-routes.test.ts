import {
  API_ENDPOINTS,
  ApiError,
  HOME_MAP_ANSWER,
  HOME_MAP_COMPACT,
  HOME_MAP_EDIT_RESULT,
  HOME_MAP_PLACE_RESULT,
  HOME_MAP_REVISION_ENTRY,
  type ClientRow,
  type DeviceRow,
  type HomeMapOp,
  type JsonValue,
  type VacuumScene,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { assembleHomeMap, type HomeMapRuntime } from '../../src/home-map/home-map-hub';
import type { Caller } from '../../src/server/auth';
import { homeMapRoutes, homeMapTag } from '../../src/server/handlers/home-map';
import type { Bound } from '../../src/server/router';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const NOW = '2026-10-08T10:00:00.000Z';
const FLOOR = 'ground';
const HALL = 'map-hall';

let opened: TestStore;
let runtime: HomeMapRuntime;
let routes: ReturnType<typeof homeMapRoutes>;
let client: ClientRow;
let person: Caller;
let assistant: Caller;

const sent: unknown[] = [];

const call = (
  route: Bound,
  caller: Caller,
  raw: { params?: unknown; query?: unknown; body?: unknown } = {},
): Promise<unknown> =>
  route.run(
    caller,
    { params: {}, query: {}, body: undefined, remote: 'test', headers: {}, ...raw },
    testLogger(),
  );

const floorOp = (): HomeMapOp => ({
  op: 'addFloor',
  floor: {
    id: FLOOR,
    name: 'Ground',
    level: 0,
    elevation: 0,
    ceilingHeight: 2.6,
    rooms: [],
    walls: [],
    openings: [],
    objects: [],
    placements: [],
    annotations: [],
  },
});

const roomOp = (homeRoomId: string | null): HomeMapOp => ({
  op: 'add',
  kind: 'room',
  floorId: FLOOR,
  element: {
    id: HALL,
    name: 'Hall',
    homeRoomId,
    polygon: {
      outer: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 3 },
        { x: 0, y: 3 },
      ],
      holes: [],
    },
    labelAt: { x: 1, y: 1 },
    colourSlot: 1,
    floorMaterial: { kind: 'wood', variant: null, tint: null },
    wallPaint: null,
    ceilingHeight: null,
    origin: { kind: 'hand' },
  },
});

const sofaOp = (id: string): HomeMapOp => ({
  op: 'add',
  kind: 'object',
  floorId: FLOOR,
  element: {
    id,
    modelId: 'cat.seating.sofa',
    finish: null,
    params: {},
    at: { x: 3.5, y: 2.5 },
    rotation: 0,
    elevation: 0,
    label: null,
    locked: false,
    origin: { kind: 'hand' },
  },
});

const edit = async (
  caller: Caller,
  ops: HomeMapOp[],
  baseRevision?: number,
): Promise<z.output<typeof HOME_MAP_EDIT_RESULT>> =>
  HOME_MAP_EDIT_RESULT.parse(
    await call(routes.editHomeMap, caller, {
      body: { baseRevision: baseRevision ?? runtime.service.revision(), ops },
    }),
  );

const device = (kind: DeviceRow['kind'], roomId: string): DeviceRow => {
  const [row] = opened.store.devices.upsert([
    {
      provider: 'tuya',
      externalId: `ext-${kind}`,
      parentId: null,
      kind,
      name: 'Lamp',
      model: 'lamp-1',
      manufacturer: 'Maker',
      providerRoom: null,
      roomId,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  if (row === undefined) throw new Error('the device was not stored');
  return row;
};

beforeEach(async () => {
  opened = await testStore(() => new Date(NOW));
  runtime = assembleHomeMap({
    store: opened.store,
    vacuums: {
      scenes: {
        latest: (): VacuumScene | undefined => undefined,
        robotMap: (): VacuumScene | undefined => undefined,
      },
      control: {
        value: (): JsonValue | undefined => undefined,
        run: (_deviceId, command): Promise<void> => {
          sent.push(command);
          return Promise.resolve();
        },
      },
    },
    scansDirectory: opened.layout.home.homeMapScans,
    now: () => new Date(NOW),
    log: testLogger('home-map'),
  });
  routes = homeMapRoutes({ homeMap: runtime, store: opened.store });
  client = opened.store.clients.create(
    { name: 'Owner', platform: 'desktop', role: 'owner', tokenHash: 'c'.repeat(64) },
    true,
  );
  person = { kind: 'client', client };
  assistant = { kind: 'client', client, via: 'assistant' };
  sent.length = 0;
});

afterEach(async () => {
  await opened.close();
});

describe('reading the map', () => {
  it('answers the whole document and tags it with its revision', async () => {
    await edit(person, [floorOp(), roomOp(null)]);
    const full = HOME_MAP_ANSWER.parse(
      await call(routes.getHomeMap, person, { query: { view: 'full' } }),
    );
    expect(full).toMatchObject({ revision: 1, floors: [{ id: FLOOR }] });
    expect(routes.getHomeMap.entityTag?.(full)).toBe('home-1');
  });

  it('answers the compact view without outlines, with areas, bounds and device positions in words', async () => {
    const store = opened.store.rooms.create('Hall', 0);
    const lamp = device('light', store.id);
    await edit(person, [floorOp(), roomOp(store.id), sofaOp('sofa-1')]);
    runtime.devices.place({}, 'profile:me');
    const compact = HOME_MAP_COMPACT.parse(
      await call(routes.getHomeMap, person, { query: { view: 'compact' } }),
    );
    expect(JSON.stringify(compact)).not.toContain('polygon');
    expect(JSON.stringify(compact)).not.toContain('outer');
    expect(compact).toMatchObject({
      view: 'compact',
      floors: [
        {
          rooms: [
            {
              id: HALL,
              name: 'Hall',
              homeRoomId: store.id,
              areaSquareMetres: 12,
              bounds: { minX: 0, minY: 0, maxX: 4, maxY: 3 },
            },
          ],
          objects: [{ id: 'sofa-1', name: 'cat.seating.sofa', roomId: HALL }],
          devices: [{ deviceId: lamp.id, roomId: HALL }],
        },
      ],
    });
    const position = JSON.stringify(compact);
    expect(position).toContain('Hall,');
    expect(position).toContain('on the ceiling');
    expect(routes.getHomeMap.entityTag?.(compact)).toMatch(/^home-2-compact-[0-9a-f]{12}$/);
  });

  it('tags a revision the same way for every reader', () => {
    expect(homeMapTag({ id: 'home', revision: 7 })).toBe('home-7');
    expect(homeMapTag({ id: 'home', revision: 7, view: 'compact' })).toBe('home-7-compact');
  });

  it('lists the revisions of one actor', async () => {
    await edit(person, [floorOp()]);
    await edit(assistant, [roomOp(null)]);
    const listed = async (query: object): Promise<z.output<typeof HOME_MAP_REVISION_ENTRY>[]> =>
      z
        .array(HOME_MAP_REVISION_ENTRY)
        .parse(await call(routes.listHomeMapRevisions, person, { query }));
    const all = await listed({});
    expect(all.map((entry) => entry.actor)).toEqual([
      expect.stringMatching(/^profile:/u),
      expect.stringMatching(/^ai:/u),
    ]);
    expect(await listed({ actor: all[1]?.actor })).toHaveLength(1);
    expect(await listed({ after: 1 })).toHaveLength(1);
  });
});

describe('editing the map', () => {
  it('answers the new revision and writes the person as the actor', async () => {
    const answer = await edit(person, [floorOp()], 0);
    expect(answer).toEqual({ revision: 1, conflicts: [] });
    expect(runtime.service.revisions()[0]?.actor).toMatch(/^profile:/u);
  });

  it('writes the assistant as its own actor', async () => {
    await edit(assistant, [floorOp()], 0);
    expect(runtime.service.revisions()[0]?.actor).toMatch(/^ai:/u);
  });

  it('refuses an edit made on a revision the hub has not reached', async () => {
    await expect(edit(person, [floorOp()], 4)).rejects.toMatchObject({ code: 'conflict' });
    await expect(edit(person, [floorOp()], 4)).rejects.toBeInstanceOf(ApiError);
  });

  it('returns the operations dropped because their element went away', async () => {
    await edit(person, [floorOp()]);
    const answer = await edit(person, [
      { op: 'update', kind: 'room', floorId: FLOOR, id: 'gone', patch: { name: 'X' } },
    ]);
    expect(answer.conflicts).toEqual([expect.objectContaining({ reason: 'missing_element' })]);
  });

  it('undoes and redoes only the changes of the one who asks', async () => {
    await edit(person, [floorOp()]);
    await edit(person, [roomOp(null)]);
    await edit(assistant, [sofaOp('sofa-1')]);
    await call(routes.undoHomeMap, person);
    const rooms = (): number => runtime.service.get().floors[0]?.rooms.length ?? 0;
    const objects = (): number => runtime.service.get().floors[0]?.objects.length ?? 0;
    expect([rooms(), objects()]).toEqual([0, 1]);
    await call(routes.undoHomeMap, assistant);
    expect(objects()).toBe(0);
    await call(routes.redoHomeMap, assistant);
    expect(objects()).toBe(1);
    await call(routes.redoHomeMap, person);
    expect(rooms()).toBe(1);
  });
});

describe('placing devices on request', () => {
  it('places the devices that wait and answers how many', async () => {
    const room = opened.store.rooms.create('Hall', 0);
    const lamp = device('light', room.id);
    await edit(person, [floorOp(), roomOp(room.id)]);
    const first = HOME_MAP_PLACE_RESULT.parse(
      await call(routes.placeHomeMapDevices, person, { body: { roomId: room.id } }),
    );
    expect(first.placed).toBe(1);
    expect(runtime.service.get().floors[0]?.placements.map((p) => p.deviceId)).toEqual([lamp.id]);
    const again = HOME_MAP_PLACE_RESULT.parse(
      await call(routes.placeHomeMapDevices, person, { body: {} }),
    );
    expect(again).toEqual({ revision: first.revision, placed: 0 });
  });

  it('serves every single-map endpoint of the contract', () => {
    const served = [
      'getHomeMap',
      'editHomeMap',
      'undoHomeMap',
      'redoHomeMap',
      'listHomeMapRevisions',
      'importHomeMapSource',
      'alignHomeMapSource',
      'resolveHomeMapNotice',
      'placeHomeMapDevices',
    ];
    expect(Object.keys(routes).sort()).toEqual([...served].sort());
    for (const name of served) expect(API_ENDPOINTS).toHaveProperty(name);
  });
});
