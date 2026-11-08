import { DatabaseSync } from 'node:sqlite';
import {
  API_ENDPOINTS,
  ApiError,
  HOME_MAP_ANSWER,
  HOME_MAP_FEED,
  HOME_MAP_FLOOR_ID,
  HOME_MAP_MAP_ID,
  HOME_MAP_REVISION_ENTRY,
  HOME_MAP_SUMMARY,
  HOME_MAP_VERSION,
  type ClientRow,
  type HomeMapActor,
  type HomeMapFeed,
  type HomeMapFeedAssignment,
  type HomeMapSummary,
  type HomeMapVersion,
  type HomeMapOp,
  type HomeMapId,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { HomeMapSet } from '../../src/home-map/map-set';
import { HomeMapService } from '../../src/home-map/service';
import { HomeMapVersions } from '../../src/home-map/versions';
import type { Caller } from '../../src/server/auth';
import { homeMapRoutes, homeMapTag } from '../../src/server/handlers/home-map';
import { homeMapSetRoutes } from '../../src/server/handlers/home-map-set';
import type { Bound } from '../../src/server/router';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { HomeMapVersionsRepository } from '../../src/store/repositories/home-map-versions';
import { HomeMapsRepository } from '../../src/store/repositories/home-maps';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

type HomeMapAnswerLike = z.infer<typeof ANSWER_LIKE>;

const NOW = '2026-10-25T10:00:00.000Z';
const HOME = HOME_MAP_MAP_ID.parse('home');
const ROBOT = '9c1d7e52-1a0b-4f3e-9b6a-2d8e4c7f1a30';
const FLOOR = 'ground';

interface ResetCall {
  readonly mapId: HomeMapId;
  readonly actor: HomeMapActor;
  readonly sourceId: string | undefined;
}

interface FeedCall {
  readonly deviceId: string;
  readonly robotMapId: number;
  readonly assignment: unknown;
  readonly actor: HomeMapActor;
}

const ANSWER_LIKE = z.looseObject({ id: z.string(), revision: z.number() });

let opened: TestStore;
let repository: HomeMapsRepository;
let service: HomeMapService;
let routes: ReturnType<typeof homeMapRoutes>;
let setRoutes: ReturnType<typeof homeMapSetRoutes>;
let member: Caller;
let owner: Caller;
let resets: ResetCall[];
let feedCalls: FeedCall[];
let reached: [string, HomeMapId | undefined][];

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

const sofaOp = (id: string): HomeMapOp => ({
  op: 'add',
  kind: 'object',
  floorId: FLOOR,
  element: {
    id,
    modelId: 'cat.seating.sofa',
    finish: null,
    params: {},
    at: { x: 1, y: 1 },
    rotation: 0,
    elevation: 0,
    label: null,
    locked: false,
    origin: { kind: 'hand' },
  },
});

const summaryOf = async (route: Bound, raw: Parameters<typeof call>[2]): Promise<HomeMapSummary> =>
  HOME_MAP_SUMMARY.parse(await call(route, member, raw));

const createMap = (name: string): Promise<HomeMapSummary> =>
  summaryOf(setRoutes.createHomeMap, { body: { name } });

const edit = (
  mapId: HomeMapId | undefined,
  ops: HomeMapOp[],
  baseRevision: number,
): Promise<unknown> =>
  call(routes.editHomeMap, member, {
    query: mapId === undefined ? {} : { mapId },
    body: { baseRevision, ops },
  });

const fullOf = async (mapId?: HomeMapId): Promise<HomeMapAnswerLike> =>
  ANSWER_LIKE.parse(
    HOME_MAP_ANSWER.parse(
      await call(routes.getHomeMap, member, {
        query: mapId === undefined ? { view: 'full' } : { view: 'full', mapId },
      }),
    ),
  );

const objectIds = (mapId: HomeMapId): string[] =>
  service.get(mapId).floors.flatMap((floor) => floor.objects.map((object) => object.id));

const feed = (robotMapId: number, target: HomeMapFeed['target']): HomeMapFeed => ({
  deviceId: ROBOT,
  robotMapId,
  robotMapName: `Robot ${String(robotMapId)}`,
  isCurrent: robotMapId === 0,
  target,
});

beforeEach(async () => {
  opened = await testStore(() => new Date(NOW));
  const database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const sql = new Sql(database);
  migrate(sql, MIGRATIONS, NOW, testLogger());
  const context = new StoreContext(sql, new ChangeFeed(testLogger('store')), () => new Date(NOW));
  repository = new HomeMapsRepository(context, () => undefined);
  service = new HomeMapService({
    maps: repository,
    knownModel: (): boolean => true,
    log: testLogger('home-map'),
  });
  resets = [];
  feedCalls = [];
  reached = [];
  const set = new HomeMapSet({
    sets: repository,
    maps: service,
    removeScan: (): void => undefined,
    log: testLogger('home-map'),
  });
  const versions = new HomeMapVersions({
    versions: new HomeMapVersionsRepository(context),
    maps: service,
    mapIds: (): HomeMapId[] => repository.ids(),
    log: testLogger('home-map'),
  });
  const note = (name: string, mapId: HomeMapId | undefined): void => {
    reached.push([name, mapId]);
  };
  const feeds = {
    list: (): HomeMapFeed[] => [
      feed(0, null),
      feed(1, { mapId: HOME, floorId: HOME_MAP_FLOOR_ID.parse(FLOOR) }),
    ],
    setFeed: (
      deviceId: string,
      robotMapId: number,
      assignment: HomeMapFeedAssignment,
      actor: HomeMapActor,
    ): HomeMapFeed => {
      feedCalls.push({ deviceId, robotMapId, assignment, actor });
      return feed(robotMapId, 'target' in assignment ? null : assignment);
    },
  };
  routes = homeMapRoutes({
    homeMap: {
      service,
      catalogue: { nameOf: (modelId): string => modelId },
      set,
      feeds,
      imports: {
        importSource: (_request, mapId) => {
          note('importSource', mapId);
          return { revision: 0, status: 'unchanged' };
        },
        align: (_sourceId, _request, _actor, mapId) => {
          note('align', mapId);
          return 0;
        },
        resolveNotice: (_noticeId, _action, _actor, mapId) => {
          note('resolveNotice', mapId);
          return 0;
        },
      },
      devices: {
        place: (_request, _actor, mapId) => {
          note('place', mapId);
          return { revision: 0, placed: 0 };
        },
      },
    },
    store: opened.store,
  });
  setRoutes = homeMapSetRoutes({
    homeMap: {
      set,
      versions,
      reset: {
        reset: (mapId, actor, sourceId) => {
          resets.push({ mapId, actor, sourceId });
          return { revision: service.revision(mapId), conflicts: [] };
        },
      },
      feeds,
    },
    store: opened.store,
  });
  const clientOf = (role: ClientRow['role'], hash: string): ClientRow =>
    opened.store.clients.create(
      { name: role, platform: 'desktop', role, tokenHash: hash.repeat(64) },
      true,
    );
  member = { kind: 'client', client: clientOf('member', 'a') };
  owner = { kind: 'client', client: clientOf('owner', 'b'), via: 'assistant' };
});

afterEach(async () => {
  await opened.close();
});

describe('access', () => {
  it('lets members read and edit every map set endpoint', () => {
    const names = Object.keys(setRoutes);
    expect(names).toHaveLength(10);
    for (const route of Object.values(setRoutes)) {
      expect(route.endpoint.access).toBe('member');
    }
    for (const name of names) expect(Reflect.has(API_ENDPOINTS, name)).toBe(true);
  });

  it('runs for a member as well as for an owner', async () => {
    await expect(call(setRoutes.listHomeMaps, member)).resolves.toEqual([]);
    await expect(call(setRoutes.listHomeMaps, owner)).resolves.toEqual([]);
  });
});

describe('the set of maps', () => {
  it('creates maps in order, the first is the default, and lists them', async () => {
    const first = await createMap('Downstairs');
    const second = await createMap('Upstairs');
    expect(first).toMatchObject({ name: 'Downstairs', isDefault: true, position: 0 });
    expect(second).toMatchObject({ name: 'Upstairs', isDefault: false, position: 1 });
    const listed = z.array(HOME_MAP_SUMMARY).parse(await call(setRoutes.listHomeMaps, member));
    expect(listed.map((entry) => entry.id)).toEqual([first.id, second.id]);
  });

  it('renames, makes default and moves, as the actor of the caller', async () => {
    const first = await createMap('A');
    const second = await createMap('B');
    const made = await summaryOf(setRoutes.updateHomeMap, {
      params: { mapId: second.id },
      body: { name: 'Attic', isDefault: true, position: 0 },
    });
    expect(made).toMatchObject({ name: 'Attic', isDefault: true, position: 0 });
    const listed = z.array(HOME_MAP_SUMMARY).parse(await call(setRoutes.listHomeMaps, member));
    expect(listed.map((entry) => [entry.id, entry.isDefault])).toEqual([
      [second.id, true],
      [first.id, false],
    ]);
    expect(
      service.revisions({ mapId: second.id }).some((entry) => entry.actor.startsWith('profile:')),
    ).toBe(true);
  });

  it('refuses an empty update and an unknown map', async () => {
    const only = await createMap('A');
    await expect(
      call(setRoutes.updateHomeMap, member, { params: { mapId: only.id }, body: {} }),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      call(setRoutes.updateHomeMap, member, {
        params: { mapId: 'nothing' },
        body: { name: 'x' },
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      call(setRoutes.deleteHomeMap, member, { params: { mapId: 'nothing' } }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('deletes a map and hands the default to the first remaining one', async () => {
    const first = await createMap('A');
    const second = await createMap('B');
    await expect(
      call(setRoutes.deleteHomeMap, member, { params: { mapId: first.id } }),
    ).resolves.toEqual({ ok: true });
    const listed = z.array(HOME_MAP_SUMMARY).parse(await call(setRoutes.listHomeMaps, member));
    expect(listed).toMatchObject([{ id: second.id, isDefault: true, position: 0 }]);
  });
});

describe('the map id of the map endpoints', () => {
  it('reads and edits the chosen map and leaves the default map alone', async () => {
    const first = await createMap('A');
    const second = await createMap('B');
    await edit(first.id, [floorOp(), sofaOp('one')], 1);
    await edit(second.id, [floorOp(), sofaOp('two'), sofaOp('three')], 1);
    expect(objectIds(first.id)).toEqual(['one']);
    expect(objectIds(second.id)).toEqual(['two', 'three']);
    expect((await fullOf()).id).toBe(first.id);
    expect((await fullOf(second.id)).id).toBe(second.id);
  });

  it('undoes and redoes on the chosen map only', async () => {
    const first = await createMap('A');
    const second = await createMap('B');
    await edit(first.id, [floorOp(), sofaOp('one')], 1);
    await edit(second.id, [floorOp(), sofaOp('two')], 1);
    await call(routes.undoHomeMap, member, { query: { mapId: second.id } });
    expect(objectIds(second.id)).toEqual([]);
    expect(objectIds(first.id)).toEqual(['one']);
    await call(routes.redoHomeMap, member, { query: { mapId: second.id } });
    expect(objectIds(second.id)).toEqual(['two']);
  });

  it('lists the revisions of the chosen map', async () => {
    const first = await createMap('A');
    const second = await createMap('B');
    await edit(first.id, [floorOp()], 1);
    await edit(second.id, [floorOp(), sofaOp('two')], 1);
    await edit(second.id, [sofaOp('three')], service.revision(second.id));
    const listed = z
      .array(HOME_MAP_REVISION_ENTRY)
      .parse(await call(routes.listHomeMapRevisions, member, { query: { mapId: second.id } }));
    expect(listed.map((entry) => entry.revision)).toEqual(
      [...listed.map((e) => e.revision)].sort(),
    );
    expect(listed.at(-1)?.revision).toBe(service.revision(second.id));
    expect(listed.length).toBe(service.revisions({ mapId: second.id }).length);
    expect(listed.length).not.toBe(service.revisions({ mapId: first.id }).length);
  });

  it('refuses a map that does not exist', async () => {
    await createMap('A');
    await expect(
      call(routes.getHomeMap, member, { query: { view: 'full', mapId: 'nothing' } }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(edit(HOME_MAP_MAP_ID.parse('nothing'), [floorOp()], 0)).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('hands the map id to the source, notice and placement actions', async () => {
    await createMap('A');
    const second = await createMap('B');
    const query = { mapId: second.id };
    await call(routes.importHomeMapSource, member, {
      query,
      body: { kind: 'xiaomi_vacuum', deviceId: ROBOT },
    });
    await call(routes.alignHomeMapSource, member, {
      query,
      params: { sourceId: 'source' },
      body: { transform: { rotationDeg: 0, tx: 0, ty: 0, mirrored: false } },
    });
    await call(routes.resolveHomeMapNotice, member, {
      query,
      params: { noticeId: 'notice' },
      body: { action: 'keep_mine' },
    });
    await call(routes.placeHomeMapDevices, member, { query, body: {} });
    expect(reached).toEqual([
      ['importSource', second.id],
      ['align', second.id],
      ['resolveNotice', second.id],
      ['place', second.id],
    ]);
  });
});

describe('the entity tag', () => {
  it('names the map as well as the revision', () => {
    expect(homeMapTag({ id: 'home', revision: 7 })).toBe('home-7');
    expect(homeMapTag({ id: 'home', revision: 7, view: 'compact' })).toBe('home-7-compact');
  });

  it('differs between maps at the same revision', async () => {
    const first = await createMap('A');
    const second = await createMap('B');
    await edit(first.id, [floorOp()], 1);
    await edit(second.id, [floorOp()], 1);
    const tags = [await fullOf(first.id), await fullOf(second.id)].map((map) =>
      routes.getHomeMap.entityTag?.(map),
    );
    expect(service.revision(first.id)).toBe(service.revision(second.id));
    expect(tags[0]).not.toBe(tags[1]);
  });

  it('changes when the default map changes, though the url stays the same', async () => {
    const first = await createMap('A');
    const second = await createMap('B');
    await edit(first.id, [floorOp()], 1);
    await edit(second.id, [floorOp()], 1);
    const before = routes.getHomeMap.entityTag?.(await fullOf());
    await call(setRoutes.updateHomeMap, member, {
      params: { mapId: second.id },
      body: { isDefault: true },
    });
    expect(routes.getHomeMap.entityTag?.(await fullOf())).not.toBe(before);
  });

  it('tags the compact view of a map apart from its full view', async () => {
    const only = await createMap('A');
    await edit(only.id, [floorOp()], 1);
    const compact = await call(routes.getHomeMap, member, {
      query: { view: 'compact', mapId: only.id },
    });
    const tag = routes.getHomeMap.entityTag?.(compact);
    expect(tag).toMatch(
      new RegExp(`^${only.id}-${String(service.revision(only.id))}-compact-[0-9a-f]{12}$`),
    );
    expect(tag).not.toBe(routes.getHomeMap.entityTag?.(await fullOf(only.id)));
  });
});

describe('the compact view', () => {
  it('lists the maps and the robot map feeds, and its tag follows them', async () => {
    const first = await createMap('A');
    await edit(first.id, [floorOp()], 1);
    const query = { view: 'compact', mapId: first.id } as const;
    const before = await call(routes.getHomeMap, member, { query });
    expect(before).toMatchObject({
      maps: [{ id: first.id, name: 'A', isDefault: true }],
      feeds: [{ robotMapId: 0, target: null }, { robotMapId: 1 }],
    });
    const tag = routes.getHomeMap.entityTag?.(before);
    await createMap('B');
    const after = await call(routes.getHomeMap, member, { query });
    expect(routes.getHomeMap.entityTag?.(after)).not.toBe(tag);
  });
});

describe('saved versions', () => {
  it('saves, lists newest first and restores as one undoable revision', async () => {
    const only = await createMap('A');
    await edit(only.id, [floorOp(), sofaOp('one')], 1);
    const saved: HomeMapVersion = HOME_MAP_VERSION.parse(
      await call(setRoutes.saveHomeMapVersion, member, {
        params: { mapId: only.id },
        body: { name: 'Before the party' },
      }),
    );
    expect(saved).toMatchObject({ mapId: only.id, name: 'Before the party' });
    await edit(only.id, [sofaOp('two'), sofaOp('three')], service.revision(only.id));
    const listed = z
      .array(HOME_MAP_VERSION)
      .parse(await call(setRoutes.listHomeMapVersions, member, { params: { mapId: only.id } }));
    expect(listed.map((entry) => entry.versionId)).toEqual([saved.versionId]);
    const before = service.revision(only.id);
    const answer = await call(setRoutes.restoreHomeMapVersion, member, {
      params: { mapId: only.id, versionId: saved.versionId },
    });
    expect(answer).toEqual({ revision: before + 1 });
    expect(objectIds(only.id)).toEqual(['one']);
    await call(routes.undoHomeMap, member, { query: { mapId: only.id } });
    expect(objectIds(only.id)).toEqual(['one', 'two', 'three']);
  });

  it('answers not found for a version that was never saved', async () => {
    const only = await createMap('A');
    await expect(
      call(setRoutes.restoreHomeMapVersion, member, {
        params: { mapId: only.id, versionId: 'missing' },
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('reset and feeds', () => {
  it('resets the chosen map to its robot map for one source or all', async () => {
    const only = await createMap('A');
    const all = await call(setRoutes.resetHomeMapToSource, owner, {
      params: { mapId: only.id },
      body: {},
    });
    expect(all).toEqual({ revision: service.revision(only.id) });
    await call(setRoutes.resetHomeMapToSource, member, {
      params: { mapId: only.id },
      body: { sourceId: 'robot-source' },
    });
    expect(resets.map(({ mapId, sourceId }) => [mapId, sourceId])).toEqual([
      [only.id, undefined],
      [only.id, 'robot-source'],
    ]);
    expect(resets[0]?.actor).toMatch(/^ai:/u);
    expect(resets[1]?.actor).toMatch(/^profile:/u);
  });

  it('lists the robot map feeds', async () => {
    const listed = z.array(HOME_MAP_FEED).parse(await call(setRoutes.listRobotMapFeeds, member));
    expect(listed.map((entry) => [entry.robotMapId, entry.target?.mapId ?? null])).toEqual([
      [0, null],
      [1, HOME],
    ]);
  });

  it('points a robot map at a floor, or at nothing, and sends nothing to the robot', async () => {
    const target = { mapId: HOME, floorId: FLOOR };
    const fed = HOME_MAP_FEED.parse(
      await call(setRoutes.setRobotMapFeed, member, {
        params: { deviceId: ROBOT, robotMapId: '1' },
        body: target,
      }),
    );
    expect(fed.target).toEqual(target);
    await call(setRoutes.setRobotMapFeed, member, {
      params: { deviceId: ROBOT, robotMapId: '1' },
      body: { target: null },
    });
    expect(feedCalls.map(({ robotMapId, assignment }) => [robotMapId, assignment])).toEqual([
      [1, target],
      [1, { target: null }],
    ]);
    await expect(
      call(setRoutes.setRobotMapFeed, member, {
        params: { deviceId: ROBOT, robotMapId: '1' },
        body: { mapId: HOME },
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
