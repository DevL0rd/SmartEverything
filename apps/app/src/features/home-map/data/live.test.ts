import { QueryClient, QueryObserver } from '@tanstack/react-query';
import {
  HOME_MAP,
  HOME_MAP_MAP_ID,
  HOME_MAP_SUMMARY,
  type HomeMap,
  type HomeMapId,
  type HomeMapSummary,
  type HomeMapSummaryRow,
  type LiveChange,
} from '@smarteverything/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HomeMapSignal } from './live';

vi.mock('../../../api/transport', () => ({
  api: (): never => {
    throw new Error('The map is not fetched from the server in this test');
  },
}));

const { homeMapQueryKey, homeMapQueryOptions } = await import('./home-map-query');
const { HOME_MAP_FEEDS_QUERY_KEY, HOME_MAP_SET_QUERY_KEY } = await import('./map-set-query');
const { applyHomeMapChanges, homeMapBehind, homeMapSetBehind, homeMapSignalsOf } =
  await import('./live');

const AT = '2026-10-25T11:00:00.000Z';

const mapAt = (revision: number, id = 'home'): HomeMap =>
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

const row = (
  id: string,
  revision: number,
  more: Partial<HomeMapSummaryRow> = {},
): HomeMapSummaryRow => ({
  id,
  revision,
  name: id,
  floors: 1,
  updatedAt: AT,
  ...more,
});

const summary = (
  id: string,
  revision: number,
  more: Partial<HomeMapSummaryRow> = {},
): LiveChange => ({
  type: 'change',
  table: 'home_maps',
  operation: 'UPDATE',
  record: row(id, revision, more),
  oldRecord: null,
  seq: revision,
});

const removal = (id: string, isDefault = false): LiveChange => ({
  type: 'change',
  table: 'home_maps',
  operation: 'DELETE',
  record: null,
  oldRecord: row(id, 5, { isDefault }),
  seq: 9,
});

const roomChange: LiveChange = {
  type: 'change',
  table: 'rooms',
  operation: 'INSERT',
  record: { id: '3b9c1d52-7a40-4e1f-8c26-5d1e0f2a9b73', name: 'Study', position: 0 },
  oldRecord: null,
  seq: 3,
};

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

const signalOf = (change: LiveChange): HomeMapSignal => {
  const [signal] = homeMapSignalsOf([change]);
  if (signal === undefined) throw new Error('The change carries no map signal');
  return signal;
};

const clients: QueryClient[] = [];

afterEach(() => {
  clients.splice(0).forEach((client) => {
    client.clear();
  });
});

function watched(
  served: Readonly<Record<string, HomeMap[]>>,
  mapId?: HomeMapId,
): { readonly client: QueryClient; readonly fetches: () => number } {
  const client = new QueryClient();
  clients.push(client);
  let fetched = 0;
  const options = homeMapQueryOptions(mapId);
  const rows = served[mapId ?? 'default'] ?? [];
  const observer = new QueryObserver(client, {
    ...options,
    queryFn: (): Promise<HomeMap> => {
      fetched += 1;
      return Promise.resolve(rows[Math.min(fetched, rows.length) - 1] ?? mapAt(0));
    },
  });
  observer.subscribe(() => undefined);
  return { client, fetches: () => fetched };
}

const settled = async (client: QueryClient): Promise<void> => {
  await vi.waitFor(() => {
    expect(client.isFetching()).toBe(0);
  });
};

describe('the home map summaries on the live stream', () => {
  it('reads the newest change of each map in a batch and ignores other tables', () => {
    expect(homeMapSignalsOf([roomChange])).toStrictEqual([]);
    const signals = homeMapSignalsOf([
      summary('home', 6),
      roomChange,
      summary('cabin', 2),
      summary('home', 7),
    ]);
    expect(signals.map((signal) => [signal.id, signal.kind])).toStrictEqual([
      ['home', 'revision'],
      ['cabin', 'revision'],
    ]);
    expect(signals[0]).toMatchObject({ revision: 7 });
    expect(homeMapSignalsOf([summary('home', 6), removal('home', true)])).toStrictEqual([
      { kind: 'removed', id: 'home', wasDefault: true },
    ]);
  });

  it('is behind only for a newer revision, a removal or nothing held', () => {
    const seen = signalOf(summary('home', 5));
    expect(homeMapBehind(undefined, seen)).toBe(true);
    expect(homeMapBehind(mapAt(5), seen)).toBe(false);
    expect(homeMapBehind(mapAt(6), seen)).toBe(false);
    expect(homeMapBehind(mapAt(5), signalOf(summary('home', 6)))).toBe(true);
    expect(homeMapBehind(mapAt(5), signalOf(removal('home')))).toBe(true);
  });

  it('sees a list entry as outdated by revision, name, order, default, scan or feeds', () => {
    const held = [entry('home', 5, { isDefault: true, fedBy: ['Robot'] })];
    const behind = (more: Partial<HomeMapSummaryRow>, id = 'home', revision = 5): boolean => {
      return homeMapSetBehind(held, signalOf(summary(id, revision, more)));
    };
    expect(behind({ isDefault: true, fedBy: ['Robot'], position: 0, hasScan: false })).toBe(false);
    expect(behind({})).toBe(false);
    expect(behind({}, 'home', 6)).toBe(true);
    expect(behind({ name: 'Renamed' })).toBe(true);
    expect(behind({ position: 2 })).toBe(true);
    expect(behind({ isDefault: false })).toBe(true);
    expect(behind({ hasScan: true })).toBe(true);
    expect(behind({ fedBy: ['Robot', 'Upstairs'] })).toBe(true);
    expect(behind({}, 'cabin', 1)).toBe(true);
  });
});

describe('refetching one map from its summary', () => {
  it('fetches once per new revision of that map and never for one it already holds', async () => {
    const { client, fetches } = watched({ default: [mapAt(5), mapAt(6)] });
    await settled(client);
    expect(fetches()).toBe(1);
    applyHomeMapChanges(client, [summary('home', 5)]);
    applyHomeMapChanges(client, [roomChange]);
    await settled(client);
    expect(fetches()).toBe(1);
    applyHomeMapChanges(client, [summary('home', 6, { isDefault: true })]);
    await settled(client);
    expect(fetches()).toBe(2);
    applyHomeMapChanges(client, [summary('home', 6, { isDefault: true })]);
    await settled(client);
    expect(fetches()).toBe(2);
    expect(client.getQueryData<HomeMap>(homeMapQueryKey())?.revision).toBe(6);
  });

  it('refetches only the map that changed', async () => {
    const { client, fetches } = watched(
      { cabin: [mapAt(1, 'cabin'), mapAt(2, 'cabin')] },
      HOME_MAP_MAP_ID.parse('cabin'),
    );
    await settled(client);
    applyHomeMapChanges(client, [summary('home', 9)]);
    await settled(client);
    expect(fetches()).toBe(1);
    applyHomeMapChanges(client, [summary('cabin', 2)]);
    await settled(client);
    expect(fetches()).toBe(2);
  });

  it('does not refetch for the revision an optimistic edit already shows', async () => {
    const { client, fetches } = watched({ default: [mapAt(5)] });
    await settled(client);
    client.setQueryData(homeMapQueryKey(), mapAt(6));
    applyHomeMapChanges(client, [summary('home', 6, { isDefault: true })]);
    await settled(client);
    expect(fetches()).toBe(1);
  });

  it('marks a map nobody watches as outdated so the next screen fetches it', () => {
    const client = new QueryClient();
    clients.push(client);
    client.setQueryData(homeMapQueryKey('home'), mapAt(5));
    applyHomeMapChanges(client, [summary('home', 6)]);
    expect(client.getQueryState(homeMapQueryKey('home'))?.isInvalidated).toBe(true);
  });
});

describe('the default map when the default changes', () => {
  it('refetches the default entry when another map becomes the default', () => {
    const client = new QueryClient();
    clients.push(client);
    client.setQueryData(homeMapQueryKey(), mapAt(5));
    applyHomeMapChanges(client, [summary('cabin', 1, { isDefault: true })]);
    expect(client.getQueryState(homeMapQueryKey())?.isInvalidated).toBe(true);
  });

  it('refetches the default entry when its map stops being the default', () => {
    const client = new QueryClient();
    clients.push(client);
    client.setQueryData(homeMapQueryKey(), mapAt(5));
    applyHomeMapChanges(client, [summary('home', 5, { isDefault: false })]);
    expect(client.getQueryState(homeMapQueryKey())?.isInvalidated).toBe(true);
  });

  it('leaves the default entry alone for another map that is not the default', () => {
    const client = new QueryClient();
    clients.push(client);
    client.setQueryData(homeMapQueryKey(), mapAt(5));
    applyHomeMapChanges(client, [summary('cabin', 4, { isDefault: false })]);
    expect(client.getQueryState(homeMapQueryKey())?.isInvalidated).toBe(false);
  });
});

describe('a removed map', () => {
  it('drops that map and the default entry that held it, and keeps the others', () => {
    const client = new QueryClient();
    clients.push(client);
    client.setQueryData(homeMapQueryKey('cabin'), mapAt(2, 'cabin'));
    client.setQueryData(homeMapQueryKey('home'), mapAt(5));
    client.setQueryData(homeMapQueryKey(), mapAt(5));
    applyHomeMapChanges(client, [removal('home', true)]);
    expect(client.getQueryData(homeMapQueryKey('home'))).toBeUndefined();
    expect(client.getQueryData(homeMapQueryKey())).toBeUndefined();
    expect(client.getQueryData<HomeMap>(homeMapQueryKey('cabin'))?.revision).toBe(2);
  });
});

describe('the list of maps', () => {
  it('is refetched when a summary differs and left alone when it matches', () => {
    const client = new QueryClient();
    clients.push(client);
    client.setQueryData(HOME_MAP_SET_QUERY_KEY, [entry('home', 5, { isDefault: true })]);
    client.setQueryData(HOME_MAP_FEEDS_QUERY_KEY, []);
    applyHomeMapChanges(client, [summary('home', 5, { isDefault: true }), roomChange]);
    expect(client.getQueryState(HOME_MAP_SET_QUERY_KEY)?.isInvalidated).toBe(false);
    applyHomeMapChanges(client, [summary('home', 6, { isDefault: true })]);
    expect(client.getQueryState(HOME_MAP_SET_QUERY_KEY)?.isInvalidated).toBe(true);
    expect(client.getQueryState(HOME_MAP_FEEDS_QUERY_KEY)?.isInvalidated).toBe(true);
  });

  it('is refetched when a map was added or removed', () => {
    const client = new QueryClient();
    clients.push(client);
    client.setQueryData(HOME_MAP_SET_QUERY_KEY, [entry('home', 5)]);
    applyHomeMapChanges(client, [summary('cabin', 1)]);
    expect(client.getQueryState(HOME_MAP_SET_QUERY_KEY)?.isInvalidated).toBe(true);
    client.setQueryData(HOME_MAP_SET_QUERY_KEY, [entry('home', 5)]);
    applyHomeMapChanges(client, [removal('home')]);
    expect(client.getQueryState(HOME_MAP_SET_QUERY_KEY)?.isInvalidated).toBe(true);
  });
});
