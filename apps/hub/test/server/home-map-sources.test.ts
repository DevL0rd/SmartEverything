import {
  HOME_MAP_IMPORT_RESULT,
  VACUUM_MAP_KEY,
  homeMapPolygonArea,
  vacuumSceneVersion,
  type ClientRow,
  type HomeMap,
  type HomeMapId,
  type HomeMapOp,
  type JsonValue,
  type VacuumScene,
} from '@smarteverything/domain';
import { pv11glCatalog } from '@smarteverything/xiaomi';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  assembleHomeMap,
  startHomeMap,
  type HomeMapRuntime,
} from '../../src/home-map/home-map-hub';
import type { Caller } from '../../src/server/auth';
import { homeMapRoutes } from '../../src/server/handlers/home-map';
import type { Bound } from '../../src/server/router';
import { vacuumPropertyKey } from '../../src/vacuum/capabilities';
import { den, hall, jitter, robotRoom, withRooms } from '../home-map/import-fixtures';
import { rectRing, syntheticScene } from '../home-map/scene-fixtures';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const NOW = '2026-10-25T10:00:00.000Z';
const CLEANING = 4;
const CHARGING = 2;
const STATUS = vacuumPropertyKey('status');
const REVISION = z.strictObject({ revision: z.int().nonnegative() });

let opened: TestStore;
let runtime: HomeMapRuntime;
let routes: ReturnType<typeof homeMapRoutes>;
let caller: Caller;
let vacuumId: string;
let scenes: Map<string, VacuumScene>;
let ticks: number;

const call = (
  route: Bound,
  raw: { params?: unknown; query?: unknown; body?: unknown } = {},
): Promise<unknown> =>
  route.run(
    caller,
    { params: {}, query: {}, body: undefined, remote: 'test', headers: {}, ...raw },
    testLogger(),
  );

const stamp = (): string => new Date(Date.parse(NOW) + (ticks += 1000)).toISOString();

const setStatus = (status: number): void => {
  opened.store.state.write([
    { deviceId: vacuumId, capability: STATUS, value: status, observedAt: stamp() },
  ]);
};

const publish = (published: VacuumScene): void => {
  const scene: VacuumScene = { ...published, robotMapId: 1 };
  scenes.set(vacuumId, scene);
  opened.store.state.write([
    {
      deviceId: vacuumId,
      capability: VACUUM_MAP_KEY,
      value: vacuumSceneVersion(scene),
      observedAt: stamp(),
    },
  ]);
};

const map = (): HomeMap => runtime.service.get();

const roomNamed = (name: string): HomeMap['floors'][number]['rooms'][number] => {
  const found = map()
    .floors.flatMap((floor) => floor.rooms)
    .find((room) => room.name === name);
  if (found === undefined) throw new Error(`no room ${name}`);
  return found;
};

const importIt = async (): Promise<z.output<typeof HOME_MAP_IMPORT_RESULT>> =>
  HOME_MAP_IMPORT_RESULT.parse(
    await call(routes.importHomeMapSource, { body: { kind: 'xiaomi_vacuum', deviceId: vacuumId } }),
  );

const resolve = async (noticeId: string, action: string): Promise<number> =>
  REVISION.parse(
    await call(routes.resolveHomeMapNotice, { params: { noticeId }, body: { action } }),
  ).revision;

const addNotice = (kind: string, elementId: string): string => {
  const op: HomeMapOp = {
    op: 'add',
    kind: 'notice',
    element: { id: `notice-${kind}`, kind, elementId, detail: kind, createdAt: NOW },
  };
  runtime.service.apply([op], 'profile:test');
  return `notice-${kind}`;
};

const addRobot = (): string => {
  const [row] = opened.store.devices.upsert([
    {
      provider: 'xiaomi',
      externalId: 'did-1',
      parentId: null,
      kind: 'vacuum',
      name: 'Robot',
      model: pv11glCatalog().model,
      manufacturer: 'Xiaomi',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  if (row === undefined) throw new Error('the robot was not stored');
  return row.id;
};

beforeEach(async () => {
  ticks = 0;
  scenes = new Map();
  opened = await testStore(() => new Date(NOW));
  vacuumId = addRobot();
  runtime = assembleHomeMap({
    store: opened.store,
    vacuums: {
      scenes: {
        latest: (deviceId): VacuumScene | undefined => scenes.get(deviceId),
        robotMap: (): VacuumScene | undefined => undefined,
      },
      control: {
        value: (deviceId, key): JsonValue | undefined => opened.store.state.value(deviceId, key),
        run: () => Promise.resolve(),
      },
    },
    scansDirectory: opened.layout.home.homeMapScans,
    now: () => new Date(NOW),
    log: testLogger('home-map'),
  });
  routes = homeMapRoutes({ homeMap: runtime, store: opened.store });
  const client: ClientRow = opened.store.clients.create(
    { name: 'Owner', platform: 'desktop', role: 'owner', tokenHash: 'c'.repeat(64) },
    true,
  );
  caller = { kind: 'client', client };
});

afterEach(async () => {
  await opened.close();
});

describe('following the robot through the change feed', () => {
  it('waits for the robot to settle, then makes the map once and follows later shapes', () => {
    const stop = startHomeMap({ homeMap: runtime, store: opened.store });
    setStatus(CLEANING);
    publish(syntheticScene);
    expect(map().revision).toBe(0);
    setStatus(CHARGING);
    expect(map().revision).toBe(1);
    expect(runtime.service.revisions()[0]?.actor).toMatch(/^source:/u);
    publish({ ...withRooms(hall(), den(rectRing(4.1, 0, 9.1, 3))), index: 8 });
    expect(map().revision).toBe(2);
    expect(homeMapPolygonArea(roomNamed('Den').polygon)).toBeCloseTo(15, 1);
    publish({ ...jitter(withRooms(hall(), den(rectRing(4.1, 0, 9.1, 3)))), index: 9 });
    expect(map().revision).toBe(2);
    stop();
  });

  it('watches a robot that is added after the hub started', () => {
    opened.store.devices.remove([vacuumId]);
    const stop = startHomeMap({ homeMap: runtime, store: opened.store });
    vacuumId = addRobot();
    setStatus(CHARGING);
    publish(syntheticScene);
    expect(map().revision).toBe(1);
    stop();
  });
});

describe('importing a robot map on request', () => {
  it('imports a settled map, reports unchanged for the same map and pending mid run', async () => {
    setStatus(CHARGING);
    publish(syntheticScene);
    expect(await importIt()).toEqual({ revision: 1, status: 'imported' });
    expect(await importIt()).toEqual({ revision: 1, status: 'unchanged' });
    setStatus(CLEANING);
    publish({ ...syntheticScene, index: 9 });
    expect(await importIt()).toEqual({ revision: 1, status: 'pending' });
  });

  it('answers pending while the robot has published nothing', async () => {
    setStatus(CHARGING);
    expect(await importIt()).toEqual({ revision: 0, status: 'pending' });
  });

  it('refuses a device that is not a robot with a map', async () => {
    await expect(
      call(routes.importHomeMapSource, {
        body: { kind: 'xiaomi_vacuum', deviceId: '00000000-0000-4000-8000-000000000001' },
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('refuses to import an imported robot onto another floor', async () => {
    setStatus(CHARGING);
    publish(syntheticScene);
    await importIt();
    await expect(
      call(routes.importHomeMapSource, {
        body: { kind: 'xiaomi_vacuum', deviceId: vacuumId, floorId: 'elsewhere' },
      }),
    ).rejects.toMatchObject({ code: 'conflict' });
  });
});

describe('aligning an imported map', () => {
  const sourceId = (): string => map().sources[0]?.id ?? '';

  it('moves the robot rooms by the given transform and keeps the user objects where they are', async () => {
    setStatus(CHARGING);
    publish(syntheticScene);
    await importIt();
    const before = roomNamed('Hall').polygon.outer[0]?.x ?? 0;
    const tx = (map().sources[0]?.transform.tx ?? 0) + 1;
    const answer = REVISION.parse(
      await call(routes.alignHomeMapSource, {
        params: { sourceId: sourceId() },
        body: { transform: { ...map().sources[0]?.transform, tx } },
      }),
    );
    expect(answer.revision).toBe(2);
    expect(map().sources[0]?.transform.tx).toBeCloseTo(tx, 6);
    expect(roomNamed('Hall').polygon.outer[0]?.x).toBeCloseTo(before + 1, 3);
  });

  it('fits a transform from two points', async () => {
    setStatus(CHARGING);
    publish(syntheticScene);
    await importIt();
    await call(routes.alignHomeMapSource, {
      params: { sourceId: sourceId() },
      body: {
        points: [
          { source: { x: 0, y: 0 }, house: { x: 2, y: 0 } },
          { source: { x: 4, y: 0 }, house: { x: 6, y: 0 } },
        ],
      },
    });
    expect(map().sources[0]?.transform).toMatchObject({ rotationDeg: 0, tx: 2, ty: 0 });
  });

  it('refuses two points that coincide and a source that does not exist', async () => {
    setStatus(CHARGING);
    publish(syntheticScene);
    await importIt();
    const same = { source: { x: 1, y: 1 }, house: { x: 1, y: 1 } };
    await expect(
      call(routes.alignHomeMapSource, {
        params: { sourceId: sourceId() },
        body: { points: [same, same] },
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    await expect(
      call(routes.alignHomeMapSource, {
        params: { sourceId: 'nope' },
        body: { transform: { rotationDeg: 0, tx: 0, ty: 0, mirrored: false } },
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('settling notices', () => {
  beforeEach(async () => {
    setStatus(CHARGING);
    publish(syntheticScene);
    await importIt();
  });

  it('turns a missing room into a hand room when kept, and removes it when deleted', async () => {
    const hallId = roomNamed('Hall').id;
    await resolve(addNotice('source_missing', hallId), 'keep_mine');
    expect(roomNamed('Hall').origin.kind).toBe('hand');
    expect(map().notices).toEqual([]);
    const denId = roomNamed('Den').id;
    await resolve(addNotice('source_missing', denId), 'delete');
    expect(map().floors[0]?.rooms.map((room) => room.name)).toEqual(['Hall']);
  });

  it('dismisses a moved or stale notice and refuses to take the robot side of it', async () => {
    const id = addNotice('link_stale', roomNamed('Hall').id);
    await expect(resolve(id, 'use_source')).rejects.toMatchObject({ code: 'invalid_request' });
    await resolve(id, 'keep_mine');
    expect(map().notices).toEqual([]);
  });

  it('answers not found for a notice that is gone', async () => {
    await expect(resolve('gone', 'delete')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('takes the robot shape of a room the user had reshaped', async () => {
    const mine = roomNamed('Den');
    runtime.service.apply(
      [
        {
          op: 'update',
          kind: 'room',
          floorId: map().floors[0]?.id ?? '',
          id: mine.id,
          patch: {
            polygon: {
              outer: [
                { x: 4.1, y: 0 },
                { x: 7.1, y: 0 },
                { x: 7.1, y: 3 },
                { x: 4.1, y: 3 },
              ],
              holes: [],
            },
            origin: { ...mine.origin, overridden: ['polygon'] },
          },
        },
      ],
      'profile:test',
    );
    const stop = startHomeMap({ homeMap: runtime, store: opened.store });
    publish({ ...withRooms(hall(), den(rectRing(4.1, 0, 10.1, 3))), index: 9 });
    stop();
    const notice = map().notices.find((entry) => entry.kind === 'source_changed');
    expect(notice).toBeDefined();
    await resolve(notice?.id ?? '', 'use_source');
    expect(homeMapPolygonArea(roomNamed('Den').polygon)).toBeCloseTo(18, 1);
    expect(map().notices).toEqual([]);
  });

  it('splits a room like the robot into the rooms the robot made', async () => {
    const stop = startHomeMap({ homeMap: runtime, store: opened.store });
    publish({
      ...withRooms(
        robotRoom(hall(), 21, 'Hall A', rectRing(0, 0, 1.5, 3)),
        robotRoom(hall(), 22, 'Hall B', rectRing(1.5, 0, 2.7, 3)),
        robotRoom(hall(), 23, 'Hall C', rectRing(2.7, 0, 4, 3)),
        den(),
      ),
      index: 9,
    });
    stop();
    const notice = map().notices.find((entry) => entry.kind === 'source_changed');
    await resolve(notice?.id ?? '', 'split_like_source');
    const names = map().floors[0]?.rooms.map((room) => room.name);
    expect(names).toEqual(expect.arrayContaining(['Hall A', 'Hall B', 'Hall C', 'Den']));
    expect(names).not.toContain('Hall');
    expect(roomNamed('Hall B').origin).toMatchObject({ kind: 'source', ref: '22' });
    expect(map().notices).toEqual([]);
  });
});

describe('working on a map that is not the default', () => {
  let annex: HomeMapId;

  const annexMap = (): HomeMap => runtime.service.get(annex);
  const query = (): { mapId: HomeMapId } => ({ mapId: annex });

  beforeEach(() => {
    runtime.set.create('Main', 'profile:test');
    annex = runtime.set.create('Annex', 'profile:test').id;
    setStatus(CHARGING);
    publish(syntheticScene);
  });

  it('imports the robot map onto that map only', async () => {
    const answer = HOME_MAP_IMPORT_RESULT.parse(
      await call(routes.importHomeMapSource, {
        query: query(),
        body: { kind: 'xiaomi_vacuum', deviceId: vacuumId },
      }),
    );
    expect(answer.status).toBe('imported');
    expect(annexMap().floors.flatMap((floor) => floor.rooms.map((room) => room.name))).toEqual([
      'Hall',
      'Den',
    ]);
    expect(map().floors).toEqual([]);
    expect(map().sources).toEqual([]);
  });

  const importAnnex = async (): Promise<void> => {
    await call(routes.importHomeMapSource, {
      query: query(),
      body: { kind: 'xiaomi_vacuum', deviceId: vacuumId },
    });
  };

  it('aligns a source of that map', async () => {
    await importAnnex();
    const source = annexMap().sources[0];
    const tx = (source?.transform.tx ?? 0) + 1;
    await call(routes.alignHomeMapSource, {
      query: query(),
      params: { sourceId: source?.id ?? '' },
      body: { transform: { ...source?.transform, tx } },
    });
    expect(annexMap().sources[0]?.transform.tx).toBeCloseTo(tx, 6);
  });

  it('settles a notice of that map', async () => {
    await importAnnex();
    const hall = annexMap().floors[0]?.rooms[0];
    runtime.service.apply(
      [
        {
          op: 'add',
          kind: 'notice',
          element: {
            id: 'annex-notice',
            kind: 'source_missing',
            elementId: hall?.id ?? '',
            detail: 'gone',
            createdAt: NOW,
          },
        },
      ],
      'profile:test',
      {},
      annex,
    );
    await call(routes.resolveHomeMapNotice, {
      query: query(),
      params: { noticeId: 'annex-notice' },
      body: { action: 'keep_mine' },
    });
    expect(annexMap().notices).toEqual([]);
    expect(annexMap().floors[0]?.rooms[0]?.origin.kind).toBe('hand');
  });

  it('places devices on that map', async () => {
    const answer = z
      .looseObject({ placed: z.int() })
      .parse(await call(routes.placeHomeMapDevices, { query: query(), body: {} }));
    expect(answer.placed).toBe(0);
  });
});
