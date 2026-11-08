import { QueryClient } from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  ApiError,
  HOME_MAP,
  HOME_MAP_FEED,
  HOME_MAP_FEED_TARGET_WRITE,
  HOME_MAP_SUMMARY,
  HOME_MAP_VERSION,
  type HomeMap,
  type HomeMapFeed,
  type HomeMapSummary,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Call {
  readonly endpoint: unknown;
  readonly request: unknown;
}

type Handler = (request: unknown) => unknown;

const calls = vi.hoisted(() => new Array<Call>());
const handlers = vi.hoisted(() => new Map<unknown, Handler>());

vi.mock('../../../api/transport', () => ({
  api: (): { call: (endpoint: unknown, request: unknown) => Promise<unknown> } => ({
    call: (endpoint, request): Promise<unknown> => {
      calls.push({ endpoint, request });
      const handler = handlers.get(endpoint);
      if (handler === undefined) return Promise.reject(new Error('No answer is set up'));
      return Promise.resolve().then(() => handler(request));
    },
  }),
}));

vi.mock('../../../store/selectors', () => ({
  useSyncStatus: (): { status: string } => ({ status: 'live' }),
}));

const { homeMapQueryKey } = await import('./home-map-query');
const {
  HOME_MAP_FEEDS_QUERY_KEY,
  HOME_MAP_SET_QUERY_KEY,
  fetchHomeMapSet,
  homeMapSetActions,
  homeMapVersionsQueryKey,
} = await import('./map-set-query');

const AT = '2026-10-25T11:00:00.000Z';
const DEVICE = '3b9c1d52-7a40-4e1f-8c26-5d1e0f2a9b73';

const entry = (id: string, revision: number, more: Partial<HomeMapSummary> = {}): HomeMapSummary =>
  HOME_MAP_SUMMARY.parse({
    id,
    name: id,
    revision,
    floorNames: [],
    roomCount: 0,
    isDefault: false,
    position: 0,
    fedBy: [],
    hasScan: false,
    updatedAt: AT,
    ...more,
  });

const mapAt = (id: string, revision: number): HomeMap =>
  HOME_MAP.parse({
    id,
    schemaVersion: 1,
    revision,
    name: id,
    north: 0,
    updatedAt: AT,
    sources: [],
    notices: [],
    floors: [],
  });

const feed = (robotMapId: number, target: HomeMapFeed['target']): HomeMapFeed =>
  HOME_MAP_FEED.parse({
    deviceId: DEVICE,
    robotMapId,
    robotMapName: null,
    isCurrent: false,
    target,
  });

const clients: QueryClient[] = [];

function held(): QueryClient {
  const client = new QueryClient();
  clients.push(client);
  return client;
}

const called = (endpoint: unknown): readonly Call[] =>
  calls.filter((call) => call.endpoint === endpoint);

beforeEach(() => {
  calls.length = 0;
  handlers.clear();
  handlers.set(E.listHomeMaps, () => [entry('home', 5, { isDefault: true }), entry('cabin', 2)]);
});

afterEach(() => {
  clients.splice(0).forEach((client) => {
    client.clear();
  });
});

describe('the set of maps', () => {
  it('reads the list from the hub', async () => {
    expect((await fetchHomeMapSet()).map((map) => map.id)).toStrictEqual(['home', 'cabin']);
    expect(calls).toStrictEqual([{ endpoint: E.listHomeMaps, request: {} }]);
  });

  it('creates a map and shows it in the list from the hub', async () => {
    const client = held();
    handlers.set(E.createHomeMap, () => entry('studio', 0));
    const outcome = await homeMapSetActions(client, true).create('Studio');
    expect(outcome).toMatchObject({ kind: 'done', value: { id: 'studio' } });
    expect(called(E.createHomeMap)[0]?.request).toStrictEqual({ body: { name: 'Studio' } });
    expect(client.getQueryData<HomeMapSummary[]>(HOME_MAP_SET_QUERY_KEY)).toHaveLength(2);
    expect(called(E.listHomeMaps)).toHaveLength(1);
  });

  it('renames, makes default and reorders through the one update call', async () => {
    const client = held();
    handlers.set(E.updateHomeMap, () => entry('cabin', 3, { isDefault: true }));
    const actions = homeMapSetActions(client, true);
    await actions.update('cabin', { name: 'Cabin', isDefault: true, position: 0 });
    expect(called(E.updateHomeMap)[0]?.request).toStrictEqual({
      params: { mapId: 'cabin' },
      body: { name: 'Cabin', isDefault: true, position: 0 },
    });
  });

  it('forgets a deleted map and everything cached for it, then re-reads the list', async () => {
    const client = held();
    client.setQueryData(homeMapQueryKey('cabin'), mapAt('cabin', 2));
    client.setQueryData(homeMapQueryKey(), mapAt('cabin', 2));
    client.setQueryData(homeMapQueryKey('home'), mapAt('home', 5));
    client.setQueryData(homeMapVersionsQueryKey('cabin'), []);
    handlers.set(E.deleteHomeMap, () => ({ ok: true }));
    await homeMapSetActions(client, true).remove('cabin');
    expect(called(E.deleteHomeMap)[0]?.request).toStrictEqual({ params: { mapId: 'cabin' } });
    expect(client.getQueryData(homeMapQueryKey('cabin'))).toBeUndefined();
    expect(client.getQueryData(homeMapQueryKey())).toBeUndefined();
    expect(client.getQueryData(homeMapVersionsQueryKey('cabin'))).toBeUndefined();
    expect(client.getQueryData<HomeMap>(homeMapQueryKey('home'))?.revision).toBe(5);
    expect(called(E.listHomeMaps)).toHaveLength(1);
  });
});

describe('edits only while connected, never queued, never resent', () => {
  it('sends nothing while offline and does not replay the attempt later', async () => {
    const client = held();
    handlers.set(E.createHomeMap, () => entry('studio', 0));
    const offline = await homeMapSetActions(client, false).create('Studio');
    expect(offline).toStrictEqual({ kind: 'offline' });
    expect(calls).toStrictEqual([]);
    await homeMapSetActions(client, true)
      .update('home', { name: 'House' })
      .catch(() => undefined);
    expect(called(E.createHomeMap)).toHaveLength(0);
  });

  it('reports a refusal from the hub and sends nothing again', async () => {
    const client = held();
    handlers.set(E.deleteHomeMap, () => {
      throw new ApiError('not_found', 'There is no such map');
    });
    const outcome = await homeMapSetActions(client, true).remove('cabin');
    expect(outcome).toStrictEqual({ kind: 'refused', message: 'There is no such map' });
    expect(called(E.deleteHomeMap)).toHaveLength(1);
    expect(called(E.listHomeMaps)).toHaveLength(0);
  });

  it('after a lost answer asks what landed and sends the change once', async () => {
    const client = held();
    client.setQueryData(homeMapQueryKey('cabin'), mapAt('cabin', 1));
    handlers.set(E.createHomeMap, () => {
      throw new Error('The connection dropped');
    });
    const outcome = await homeMapSetActions(client, true).create('Studio');
    expect(outcome).toStrictEqual({ kind: 'unconfirmed' });
    expect(called(E.createHomeMap)).toHaveLength(1);
    expect(called(E.listHomeMaps)).toHaveLength(1);
    expect(client.getQueryData<HomeMapSummary[]>(HOME_MAP_SET_QUERY_KEY)).toHaveLength(2);
    expect(client.getQueryState(homeMapQueryKey('cabin'))?.isInvalidated).toBe(true);
  });
});

describe('versions, reset and feeds', () => {
  it('saves a version and marks the version list outdated', async () => {
    const client = held();
    client.setQueryData(homeMapVersionsQueryKey('home'), []);
    handlers.set(E.saveHomeMapVersion, () =>
      HOME_MAP_VERSION.parse({
        mapId: 'home',
        versionId: 'v1',
        name: 'Before the move',
        createdAt: AT,
        actor: 'profile:alice',
      }),
    );
    const actions = homeMapSetActions(client, true);
    await actions.saveVersion('home', 'Before the move');
    await actions.saveVersion('home');
    expect(called(E.saveHomeMapVersion).map((call) => call.request)).toStrictEqual([
      { params: { mapId: 'home' }, body: { name: 'Before the move' } },
      { params: { mapId: 'home' }, body: {} },
    ]);
    expect(client.getQueryState(homeMapVersionsQueryKey('home'))?.isInvalidated).toBe(true);
  });

  it('refetches the restored map only when it is behind the answered revision', async () => {
    const client = held();
    client.setQueryData(homeMapQueryKey('home'), mapAt('home', 5));
    handlers.set(E.restoreHomeMapVersion, () => ({ revision: 6 }));
    handlers.set(E.getHomeMap, () => mapAt('home', 6));
    const actions = homeMapSetActions(client, true);
    await actions.restore('home', 'v1');
    expect(called(E.restoreHomeMapVersion)[0]?.request).toStrictEqual({
      params: { mapId: 'home', versionId: 'v1' },
    });
    expect(called(E.getHomeMap)[0]?.request).toStrictEqual({
      query: { view: 'full', mapId: 'home' },
    });
    expect(client.getQueryData<HomeMap>(homeMapQueryKey('home'))?.revision).toBe(6);
    await actions.restore('home', 'v1');
    expect(called(E.getHomeMap)).toHaveLength(1);
  });

  it('resets one source or all of them and refetches the default entry that holds the map', async () => {
    const client = held();
    client.setQueryData(homeMapQueryKey(), mapAt('home', 5));
    handlers.set(E.resetHomeMapToSource, () => ({ revision: 7 }));
    handlers.set(E.getHomeMap, () => mapAt('home', 7));
    const actions = homeMapSetActions(client, true);
    await actions.reset('home', 'src-1');
    await actions.reset('home');
    expect(called(E.resetHomeMapToSource).map((call) => call.request)).toStrictEqual([
      { params: { mapId: 'home' }, body: { sourceId: 'src-1' } },
      { params: { mapId: 'home' }, body: {} },
    ]);
    expect(client.getQueryData<HomeMap>(homeMapQueryKey())?.revision).toBe(7);
    expect(called(E.getHomeMap)[0]?.request).toStrictEqual({ query: { view: 'full' } });
  });

  it('moves a robot map to another floor and not-used, updating the cached feed', async () => {
    const client = held();
    client.setQueryData(HOME_MAP_FEEDS_QUERY_KEY, [feed(1, null), feed(2, null)]);
    const target = HOME_MAP_FEED_TARGET_WRITE.parse({ mapId: 'home', floorId: 'ground' });
    const actions = homeMapSetActions(client, true);
    handlers.set(E.setRobotMapFeed, () => feed(2, target));
    await actions.setFeed(DEVICE, 2, target);
    expect(called(E.setRobotMapFeed)[0]?.request).toStrictEqual({
      params: { deviceId: DEVICE, robotMapId: '2' },
      body: target,
    });
    const after = client.getQueryData<HomeMapFeed[]>(HOME_MAP_FEEDS_QUERY_KEY);
    expect(after?.map((item) => item.target?.mapId ?? null)).toStrictEqual([null, 'home']);
    handlers.set(E.setRobotMapFeed, () => feed(2, null));
    await actions.setFeed(DEVICE, 2, { target: null });
    const cleared = client.getQueryData<HomeMapFeed[]>(HOME_MAP_FEEDS_QUERY_KEY);
    expect(cleared?.map((item) => item.target)).toStrictEqual([null, null]);
  });
});
