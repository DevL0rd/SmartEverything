import { DatabaseSync } from 'node:sqlite';
import type { JsonValue, VacuumSavedMap, VacuumScene } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import {
  NO_PUSHED_MAP_OBJECTS,
  pv11glCatalog,
  type PushedMapObjects,
} from '@smarteverything/xiaomi';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { XiaomiCloud } from '../../src/adapters/xiaomi/cloud-api';
import {
  MAP_DOWNLOAD_MAX_BYTES,
  MapDownloadError,
  createMapCloud,
  type MapCloud,
} from '../../src/adapters/xiaomi/map-cloud';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { VacuumScenesRepository } from '../../src/store/repositories/vacuum-scenes';
import { Sql } from '../../src/store/sql';
import { MapCache } from '../../src/vacuum/map-cache';
import {
  MapFetcher,
  mapTargetOf,
  type MapIdentity,
  type MapTarget,
  type MapUnreadable,
} from '../../src/vacuum/map-fetch';
import { readVacuumFixture, vacuumObjectName, type VacuumIdentity } from '../support/fake-vacuum';
import { FakeVacuumCloud, sealVacuumMap } from '../support/fake-vacuum-cloud';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';
import { FakeAccount, SSECURITY, USER_ID } from '../xiaomi/fake-account';
import { dependencies, routedFetch } from '../xiaomi/harness';

const NOW = '2026-10-24T10:00:00.000Z';
const ROBOT = 'robot';
const IDENTITY: VacuumIdentity = { did: '5550001', uid: '4440002' };

const SECRET_MARKERS = ['fds.vacuum.test', 'Signature', IDENTITY.did, IDENTITY.uid, 'obj_name'];

let logs: CapturedLogs;
let cloud: FakeVacuumCloud;
let cache: MapCache;
let repository: VacuumScenesRepository;
let fetcher: MapFetcher;
let published: { readonly deviceId: string; readonly scene: VacuumScene }[];
let unreadable: MapUnreadable[];
let summaries: VacuumSavedMap[][];
let tasks: { readonly deviceId: string; readonly taskId: number | null }[];
let routes: { readonly deviceId: string; readonly cursor: number | null }[];
let hold: Promise<void> | null;

async function failureOf(work: Promise<unknown>): Promise<Error> {
  const outcome = await work.then(
    () => null,
    (error: unknown) => error,
  );
  if (!(outcome instanceof Error)) throw new Error('the call was expected to fail');
  return outcome;
}

function push(index: number, slot = 0): string {
  return JSON.stringify({ index, obj_name: vacuumObjectName(IDENTITY, slot) });
}

interface EntryOptions {
  readonly name?: string;
  readonly temp?: number;
}

function entry(
  mapId: number,
  slot: number,
  current: boolean,
  options: EntryOptions = {},
): Record<string, JsonValue> {
  return {
    map_name: options.name ?? `Map ${String(mapId)}`,
    obj_name: vacuumObjectName(IDENTITY, slot),
    map_id: mapId,
    temp: options.temp ?? 0,
    is_current: current,
  };
}

function savedPush(index: number, maps: readonly Record<string, JsonValue>[]): string {
  return JSON.stringify({ index, map_array: maps });
}

function currentTarget(index: number): MapTarget {
  return {
    deviceId: ROBOT,
    slot: 'current',
    index,
    objName: vacuumObjectName(IDENTITY, 0),
  };
}

function build(): MapCloud {
  const account = new FakeAccount({ captcha: false, verification: false, wrongCaptchas: 0 });
  account.serviceToken = 'service';
  cloud = new FakeVacuumCloud(account, IDENTITY);
  const fetch = routedFetch([cloud.route]);
  const deps = dependencies(fetch, 0);
  const xiaomi = new XiaomiCloud(
    deps,
    {
      userId: USER_ID,
      passToken: 'pass',
      ssecurity: SSECURITY,
      serviceToken: 'service',
      deviceId: 'device',
      region: 'de',
    },
    {
      saveSecrets: (): Promise<void> => Promise.resolve(),
      needsAttention: (): Promise<void> => Promise.resolve(),
      log: new Logger('tool.xiaomi-test'),
    },
  );
  const real = createMapCloud(xiaomi, deps);
  return {
    call: async (path, data): Promise<JsonValue> => {
      await hold;
      return real.call(path, data);
    },
    download: (url): Promise<Uint8Array> => real.download(url),
  };
}

beforeEach(() => {
  logs = captureLogs();
  const database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const sql = new Sql(database);
  migrate(sql, MIGRATIONS, NOW, testLogger());
  database
    .prepare(
      `insert into devices (id, provider, external_id, kind, name, model, manufacturer, created_at, updated_at)
       values (?, 'xiaomi', ?, 'vacuum', 'Robot', 'xiaomi.vacuum.pv11gl', 'Xiaomi', ?, ?)`,
    )
    .run(ROBOT, ROBOT, NOW, NOW);
  repository = new VacuumScenesRepository(
    new StoreContext(sql, new ChangeFeed(testLogger('store')), () => new Date(NOW)),
  );
  cache = new MapCache(repository);
  published = [];
  unreadable = [];
  summaries = [];
  tasks = [];
  routes = [];
  hold = null;
  fetcher = new MapFetcher({
    cloud: build(),
    cache,
    identity: (): MapIdentity => ({ model: pv11glCatalog().model, did: IDENTITY.did }),
    pushed: (): PushedMapObjects => NO_PUSHED_MAP_OBJECTS,
    published: (deviceId, scene): void => {
      published.push({ deviceId, scene });
    },
    savedMaps: (_deviceId, maps): void => {
      summaries.push([...maps]);
    },
    unreadable: (failure): void => {
      unreadable.push(failure);
    },
    task: (deviceId, taskId): void => {
      tasks.push({ deviceId, taskId });
    },
    route: (deviceId, route): void => {
      routes.push({ deviceId, cursor: route?.cursor ?? null });
    },
    now: (): Date => new Date(NOW),
    log: testLogger('vacuum'),
  });
});

describe('the map fetch trigger', () => {
  it('fetches nothing on its own, on a note or on a demand without a known index', async () => {
    await fetcher.demand(ROBOT, 'current');
    fetcher.notePush(ROBOT, 'current', push(10));
    fetcher.notePush(ROBOT, 'saved', '');
    expect(cloud.urlRequests).toStrictEqual([]);
    expect(cloud.downloads).toStrictEqual([]);
    expect(published).toStrictEqual([]);
  });

  it('fetches a noted index once on demand and then serves it from the cache', async () => {
    fetcher.notePush(ROBOT, 'current', push(10));
    await fetcher.demand(ROBOT, 'current');
    await fetcher.demand(ROBOT, 'current');
    expect(cloud.urlRequests).toHaveLength(1);
    expect(published.map((entry) => entry.scene.index)).toStrictEqual([10]);
    expect(cache.latest(ROBOT, 'current')?.index).toBe(10);
  });

  it('reports the task id and the blob route of a fetched current map and none for a cached one', async () => {
    await fetcher.observePush(ROBOT, 'current', push(11));
    expect(tasks).toStrictEqual([{ deviceId: ROBOT, taskId: 1_000_001 }]);
    expect(routes).toStrictEqual([{ deviceId: ROBOT, cursor: 41 }]);
    await fetcher.observePush(ROBOT, 'current', push(11));
    expect(tasks).toHaveLength(1);
  });

  it('fetches an index change once and never again for the same index', async () => {
    await fetcher.observePush(ROBOT, 'current', push(11));
    await fetcher.observePush(ROBOT, 'current', push(11));
    expect(cloud.urlRequests).toStrictEqual([
      { path: '/v2/home/get_interim_file_url_pro', objName: vacuumObjectName(IDENTITY, 0) },
    ]);
    expect(cloud.downloads).toHaveLength(1);
    expect(repository.has(ROBOT, 'current', 11)).toBe(true);
    expect(published).toHaveLength(1);
    await fetcher.observePush(ROBOT, 'current', push(12));
    expect(cloud.urlRequests).toHaveLength(2);
  });

  it('ignores an empty push and a push that is not JSON without fetching', async () => {
    await fetcher.observePush(ROBOT, 'current', '');
    await fetcher.observePush(ROBOT, 'current', 'not json');
    await fetcher.observePush(ROBOT, 'current', 7);
    expect(cloud.urlRequests).toStrictEqual([]);
    expect(logs.events()).toContain('vacuum_map.push_unreadable');
  });
});

describe('coalescing', () => {
  it('keeps one fetch in flight per slot and fetches only the latest waiting index next', async () => {
    let release: () => void = () => undefined;
    hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = fetcher.observe(currentTarget(21));
    const second = fetcher.observe(currentTarget(22));
    const third = fetcher.observe(currentTarget(23));
    expect(cloud.urlRequests).toStrictEqual([]);
    release();
    await Promise.all([first, second, third]);
    expect(repository.indexes(ROBOT, 'current')).toStrictEqual([23, 21]);
    expect(cloud.urlRequests).toHaveLength(2);
    expect(published.map((entry) => entry.scene.index)).toStrictEqual([21, 23]);
  });

  it('runs different slots independently', async () => {
    await Promise.all([
      fetcher.observePush(ROBOT, 'current', push(31)),
      fetcher.observePush(ROBOT, 'saved', savedPush(32, [entry(1, 3, true)])),
    ]);
    expect(cache.latest(ROBOT, 'current')?.index).toBe(31);
    expect(cache.latest(ROBOT, 'saved')?.index).toBe(32);
  });
});

describe('the cloud calls', () => {
  it('uses the interim pro variant for saved maps and backups too', async () => {
    await fetcher.observePush(
      ROBOT,
      'saved',
      JSON.stringify({
        index: 41,
        map_array: [{ map_id: 1, obj_name: vacuumObjectName(IDENTITY, 3), is_current: true }],
      }),
    );
    await fetcher.observePush(
      ROBOT,
      'backup',
      JSON.stringify({
        index: 42,
        backup_map_arr: [
          { obj_name: 'older/older/8', backup_id: 1 },
          { obj_name: vacuumObjectName(IDENTITY, 8), backup_id: 2 },
        ],
      }),
    );
    expect(cloud.urlRequests).toStrictEqual([
      { path: '/v2/home/get_interim_file_url_pro', objName: vacuumObjectName(IDENTITY, 3) },
      { path: '/v2/home/get_interim_file_url_pro', objName: vacuumObjectName(IDENTITY, 8) },
    ]);
    expect(cache.latest(ROBOT, 'saved')?.slot).toBe('saved');
    expect(cache.latest(ROBOT, 'backup')?.slot).toBe('backup');
  });

  it('falls back to the plain variant when the pro variant is unavailable and logs it', async () => {
    cloud.proUnavailable = true;
    await fetcher.observePush(ROBOT, 'current', push(51));
    expect(cloud.urlRequests.map((request) => request.path)).toStrictEqual([
      '/v2/home/get_interim_file_url_pro',
      '/v2/home/get_interim_file_url',
    ]);
    expect(repository.has(ROBOT, 'current', 51)).toBe(true);
    const record = logs.records.find(
      (entry) => entry.event === 'vacuum_map.interim_pro_unavailable',
    );
    expect(record?.payload).toMatchObject({ cloudCode: -6, slot: 'current', index: 51 });
  });

  it('logs a missing object as a failed url stage without a device notice', async () => {
    await fetcher.observe({ ...currentTarget(61), objName: vacuumObjectName(IDENTITY, 9) });
    expect(repository.indexes(ROBOT, 'current')).toStrictEqual([]);
    expect(unreadable).toStrictEqual([]);
    const record = logs.records.find((entry) => entry.event === 'vacuum_map.fetch_failed');
    expect(record?.payload).toMatchObject({ stage: 'url', index: 61 });
  });

  it('treats the null file as no map: nothing cached, no notice', async () => {
    cloud.setNullFile(vacuumObjectName(IDENTITY, 0));
    await fetcher.observePush(ROBOT, 'current', push(71));
    expect(repository.indexes(ROBOT, 'current')).toStrictEqual([]);
    expect(unreadable).toStrictEqual([]);
    expect(logs.events()).toContain('vacuum_map.no_map');
  });
});

describe('the saved robot maps', () => {
  const objectOf = (slot: number): string => vacuumObjectName(IDENTITY, slot);

  beforeEach(() => {
    for (const slot of [4, 5, 6]) {
      cloud.setMap(objectOf(slot), readVacuumFixture('maps/pv11gl-saved.json', z.unknown()));
    }
  });

  const fetchedObjects = (): string[] => cloud.urlRequests.map((request) => request.objName);

  it('fetches each permanent map once, caches one scene per robot map and publishes the summaries', async () => {
    await fetcher.observePush(
      ROBOT,
      'saved',
      savedPush(100, [
        entry(1, 3, false, { name: 'Alpha' }),
        entry(2, 4, true, { name: 'Beta' }),
        entry(3, 5, false, { name: 'Gamma', temp: 1 }),
      ]),
    );
    expect(fetchedObjects().toSorted()).toStrictEqual([objectOf(3), objectOf(4)]);
    expect(cache.robotMap(ROBOT, 1)).toMatchObject({
      slot: 'saved',
      index: 100,
      name: 'Alpha',
      robotMapId: 1,
      robotMapName: 'Alpha',
      isCurrent: false,
    });
    expect(cache.robotMap(ROBOT, 2)).toMatchObject({ robotMapId: 2, isCurrent: true });
    expect(cache.robotMap(ROBOT, 3)).toBeUndefined();
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.map((map) => [map.robotMapId, map.name, map.isCurrent])).toStrictEqual([
      [1, 'Alpha', false],
      [2, 'Beta', true],
    ]);
    expect(summaries[0]?.[0]?.rooms).toBeGreaterThan(0);
    expect(summaries[0]?.[0]?.version).toBe('100:saved:1');
    expect(published.map((item) => [item.scene.slot, item.scene.robotMapId])).toStrictEqual([
      ['saved', 2],
    ]);
  });

  it('fetches nothing for the same list twice and nothing on a note', async () => {
    const list = savedPush(110, [entry(1, 3, true)]);
    fetcher.notePush(ROBOT, 'saved', list);
    expect(cloud.urlRequests).toStrictEqual([]);
    await fetcher.demand(ROBOT, 'saved');
    await fetcher.observePush(ROBOT, 'saved', list);
    await fetcher.demand(ROBOT, 'saved');
    expect(cloud.urlRequests).toHaveLength(1);
    expect(summaries).toHaveLength(1);
  });

  it('refetches only the current map when the list index changes', async () => {
    await fetcher.observePush(
      ROBOT,
      'saved',
      savedPush(120, [entry(1, 3, false), entry(2, 4, true)]),
    );
    await fetcher.observePush(
      ROBOT,
      'saved',
      savedPush(121, [entry(1, 3, false), entry(2, 4, true)]),
    );
    expect(fetchedObjects().slice(2)).toStrictEqual([objectOf(4)]);
    expect(cache.robotMap(ROBOT, 1)?.index).toBe(120);
    expect(cache.robotMap(ROBOT, 2)?.index).toBe(121);
  });

  it('refetches only the renamed map and takes the name from the list', async () => {
    await fetcher.observePush(
      ROBOT,
      'saved',
      savedPush(130, [entry(1, 3, false, { name: 'Alpha' }), entry(2, 4, true, { name: 'Beta' })]),
    );
    await fetcher.observePush(
      ROBOT,
      'saved',
      savedPush(130, [entry(1, 3, false, { name: 'Gamma' }), entry(2, 4, true, { name: 'Beta' })]),
    );
    expect(fetchedObjects().slice(2)).toStrictEqual([objectOf(3)]);
    expect(cache.robotMap(ROBOT, 1)?.name).toBe('Gamma');
    expect(summaries.at(-1)?.map((map) => map.name)).toStrictEqual(['Gamma', 'Beta']);
  });

  it('refetches both maps on a switch and flips which one is current', async () => {
    await fetcher.observePush(
      ROBOT,
      'saved',
      savedPush(140, [entry(1, 3, true), entry(2, 4, false)]),
    );
    await fetcher.observePush(
      ROBOT,
      'saved',
      savedPush(141, [entry(1, 3, false), entry(2, 4, true)]),
    );
    expect(cloud.urlRequests).toHaveLength(4);
    expect(summaries.at(-1)?.map((map) => map.isCurrent)).toStrictEqual([false, true]);
    expect(cache.latest(ROBOT, 'saved')?.robotMapId).toBe(2);
  });

  it('turns a saved temporary map into a fed map and drops a deleted one', async () => {
    await fetcher.observePush(
      ROBOT,
      'saved',
      savedPush(150, [entry(1, 3, false), entry(9, 6, true, { name: '', temp: 1 })]),
    );
    expect(summaries.at(-1)?.map((map) => map.robotMapId)).toStrictEqual([1]);
    await fetcher.observePush(
      ROBOT,
      'saved',
      savedPush(151, [entry(1, 3, false), entry(9, 4, true, { name: 'New' })]),
    );
    expect(summaries.at(-1)?.map((map) => map.robotMapId)).toStrictEqual([1, 9]);
    await fetcher.observePush(ROBOT, 'saved', savedPush(152, [entry(9, 4, true, { name: 'New' })]));
    expect(summaries.at(-1)?.map((map) => map.robotMapId)).toStrictEqual([9]);
    expect(cache.robotMap(ROBOT, 1)).toBeUndefined();
    await fetcher.observePush(ROBOT, 'saved', savedPush(153, []));
    expect(summaries.at(-1)).toStrictEqual([]);
  });

  it('downloads a shared object once and keeps a scene per robot map', async () => {
    await fetcher.observePush(
      ROBOT,
      'saved',
      savedPush(160, [entry(1, 3, false), entry(2, 3, true)]),
    );
    expect(cloud.urlRequests).toHaveLength(1);
    expect(cache.robotMap(ROBOT, 1)?.robotMapId).toBe(1);
    expect(cache.robotMap(ROBOT, 2)?.robotMapId).toBe(2);
  });

  it('keeps the other maps when one object cannot be read and retries it on the next change', async () => {
    await fetcher.observePush(
      ROBOT,
      'saved',
      savedPush(170, [
        entry(1, 3, false),
        { ...entry(2, 9, true), obj_name: vacuumObjectName(IDENTITY, 9) },
      ]),
    );
    expect(cache.robotMap(ROBOT, 1)).toBeDefined();
    expect(cache.robotMap(ROBOT, 2)).toBeUndefined();
    expect(summaries.at(-1)?.map((map) => map.robotMapId)).toStrictEqual([1]);
    cloud.setMap(objectOf(9), readVacuumFixture('maps/pv11gl-saved.json', z.unknown()));
    await fetcher.observePush(
      ROBOT,
      'saved',
      savedPush(171, [entry(1, 3, false), entry(2, 9, true)]),
    );
    expect(cache.robotMap(ROBOT, 2)).toBeDefined();
    expect(cloud.urlRequests.filter((request) => request.objName === objectOf(3))).toHaveLength(1);
  });

  it('reports an unreadable saved map with its robot map id', async () => {
    cloud.setMap(objectOf(4), { not: 'a map' });
    await fetcher.observePush(ROBOT, 'saved', savedPush(180, [entry(7, 4, false)]));
    expect(unreadable).toStrictEqual([
      {
        deviceId: ROBOT,
        slot: 'saved',
        index: 180,
        stage: 'decode',
        robotMapId: 7,
        lastGood: null,
      },
    ]);
  });

  it('skips malformed entries with one warning and survives lists that are not lists', async () => {
    await fetcher.observePush(
      ROBOT,
      'saved',
      JSON.stringify({
        index: 190,
        map_array: [
          entry(1, 3, true),
          { obj_name: objectOf(4) },
          { map_id: 2, obj_name: '' },
          'x',
          null,
        ],
      }),
    );
    expect(cloud.urlRequests).toHaveLength(1);
    expect(
      logs.events().filter((event) => event === 'vacuum_map.saved_entries_skipped'),
    ).toHaveLength(1);
    await fetcher.observePush(ROBOT, 'saved', '{}');
    await fetcher.observePush(ROBOT, 'saved', JSON.stringify({ index: 1 }));
    await fetcher.observePush(ROBOT, 'saved', 'not json');
    expect(cloud.urlRequests).toHaveLength(1);
    expect(logs.events()).toContain('vacuum_map.push_unreadable');
  });

  it('reads an absent temp flag as permanent and an absent current flag as not current', async () => {
    await fetcher.observePush(
      ROBOT,
      'saved',
      JSON.stringify({
        index: 200,
        map_array: [{ map_name: 'A', obj_name: objectOf(3), map_id: 1 }],
      }),
    );
    expect(cache.robotMap(ROBOT, 1)?.isCurrent).toBe(false);
  });

  it('gives the current map its robot map id from the blob and leaves the other maps alone', async () => {
    cloud.setMap(objectOf(0), {
      ...readVacuumFixture('maps/pv11gl-current.json', z.record(z.string(), z.unknown())),
      map_id: 2,
    });
    await fetcher.observePush(ROBOT, 'current', push(210));
    expect(cache.latest(ROBOT, 'current')).toMatchObject({ robotMapId: 2, slot: 'current' });
    expect(cache.robotMap(ROBOT, 2)).toBeUndefined();
  });
});

describe('a map that cannot be read', () => {
  it('keeps the last good scene, raises one notice and logs the stage', async () => {
    await fetcher.observePush(ROBOT, 'current', push(81));
    cloud.setMap(vacuumObjectName(IDENTITY, 0), { not: 'a map' });
    await fetcher.observePush(ROBOT, 'current', push(82));
    expect(unreadable).toStrictEqual([
      {
        deviceId: ROBOT,
        slot: 'current',
        index: 82,
        stage: 'decode',
        robotMapId: null,
        lastGood: { index: 81, fetchedAt: NOW },
      },
    ]);
    expect(cache.latest(ROBOT, 'current')?.index).toBe(81);
    expect(repository.has(ROBOT, 'current', 82)).toBe(false);
    expect(published.map((entry) => entry.scene.index)).toStrictEqual([81]);
  });

  it('reports a blob sealed with another device key as a decode failure', async () => {
    cloud.objects.set(
      vacuumObjectName(IDENTITY, 0),
      sealVacuumMap({ width: 1 }, pv11glCatalog().model, 'wrong-did'),
    );
    await fetcher.observePush(ROBOT, 'current', push(91));
    expect(unreadable).toHaveLength(1);
    expect(unreadable[0]).toMatchObject({ stage: 'decode', lastGood: null });
  });

  it('never logs the signed url, the url response, the object name or the blob', async () => {
    await fetcher.observePush(ROBOT, 'current', push(101));
    cloud.setMap(vacuumObjectName(IDENTITY, 0), { not: 'a map' });
    await fetcher.observePush(ROBOT, 'current', push(102));
    await fetcher.observePush(ROBOT, 'current', 'not json');
    const lines = JSON.stringify(logs.records);
    for (const marker of SECRET_MARKERS) {
      expect(lines).not.toContain(marker);
    }
    const received = logs.records.find((entry) => entry.event === 'vacuum_map.blob_received');
    expect(received?.payload).toMatchObject({ slot: 'current', index: 101 });
    expect(Object.keys(received?.payload ?? {}).toSorted()).toStrictEqual([
      'bytes',
      'deviceId',
      'index',
      'slot',
    ]);
  });
});

describe('the signed download', () => {
  const OK = new Response(new Uint8Array([1, 2, 3]), { status: 200 });

  it('refuses a url that is not https before any request', async () => {
    const seen: string[] = [];
    const mapCloud = createMapCloud(
      { call: () => Promise.resolve(null) },
      {
        fetch: (url) => {
          seen.push(url);
          return Promise.resolve(OK);
        },
      },
    );
    await expect(mapCloud.download('http://fds.example/map?Signature=x')).rejects.toMatchObject({
      reason: 'protocol',
    });
    await expect(mapCloud.download('not a url')).rejects.toBeInstanceOf(MapDownloadError);
    expect(seen).toStrictEqual([]);
  });

  it('sends no credentials, does not follow redirects and keeps the url out of errors', async () => {
    const inits: RequestInit[] = [];
    const url = 'https://fds.example/map?Signature=secret';
    const mapCloud = createMapCloud(
      { call: () => Promise.resolve(null) },
      {
        fetch: (_url, init) => {
          inits.push(init);
          return Promise.resolve(new Response('', { status: 302 }));
        },
      },
    );
    const failure = await failureOf(mapCloud.download(url));
    expect(failure).toMatchObject({ reason: 'status', status: 302 });
    expect(JSON.stringify(failure) + failure.message).not.toContain('secret');
    expect(inits[0]?.headers).toBeUndefined();
    expect(inits[0]?.redirect).toBe('manual');
  });

  it('refuses a map larger than the limit by its header and while streaming', async () => {
    const declared = createMapCloud(
      { call: () => Promise.resolve(null) },
      {
        fetch: () =>
          Promise.resolve(
            new Response('x', {
              status: 200,
              headers: { 'content-length': String(MAP_DOWNLOAD_MAX_BYTES + 1) },
            }),
          ),
      },
    );
    await expect(declared.download('https://fds.example/map')).rejects.toMatchObject({
      reason: 'size',
    });
    const chunk = new Uint8Array(MAP_DOWNLOAD_MAX_BYTES / 4 + 1);
    const streamed = createMapCloud(
      { call: () => Promise.resolve(null) },
      {
        fetch: () =>
          Promise.resolve(
            new Response(
              new ReadableStream<Uint8Array>({
                start: (controller): void => {
                  for (let part = 0; part < 4; part += 1) controller.enqueue(chunk);
                  controller.close();
                },
              }),
              { status: 200 },
            ),
          ),
      },
    );
    await expect(streamed.download('https://fds.example/map')).rejects.toMatchObject({
      reason: 'size',
    });
  });

  it('wraps a network failure without the url or the underlying message', async () => {
    const mapCloud = createMapCloud(
      { call: () => Promise.resolve(null) },
      { fetch: () => Promise.reject(new Error('connect to fds.example?Signature=secret failed')) },
    );
    const failure = await failureOf(mapCloud.download('https://fds.example/map?Signature=secret'));
    expect(failure).toMatchObject({ reason: 'network' });
    expect(failure.message).not.toContain('secret');
    expect(failure.cause).toBeUndefined();
  });
});

describe('reading the map pushes', () => {
  it('reads the index and object of each slot', () => {
    expect(mapTargetOf(ROBOT, 'current', push(5))).toStrictEqual(currentTarget(5));
    expect(mapTargetOf(ROBOT, 'current', '')).toBeNull();
    expect(mapTargetOf(ROBOT, 'current', JSON.stringify({ index: 1 }))).toBeNull();
    expect(
      mapTargetOf(ROBOT, 'backup', JSON.stringify({ index: 3, backup_map_arr: [] })),
    ).toBeNull();
  });
});
