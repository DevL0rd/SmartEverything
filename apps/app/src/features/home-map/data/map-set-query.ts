import { useMemo } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  ApiError,
  type HomeMap,
  type HomeMapFeed,
  type HomeMapFeedAssignment,
  type HomeMapSummary,
  type HomeMapVersion,
} from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { api } from '../../../api/transport';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { useSyncStatus } from '../../../store/selectors';
import { homeMapQueryKey, refetchHomeMap } from './home-map-query';

const log = new Logger('app.home-map');

export const HOME_MAP_SET_QUERY_KEY = ['window', 'home-map', 'maps'] as const;
export const HOME_MAP_FEEDS_QUERY_KEY = ['window', 'home-map', 'feeds'] as const;

export function homeMapVersionsQueryKey(mapId: string): readonly unknown[] {
  return ['window', 'home-map', 'versions', mapId];
}

export function fetchHomeMapSet(): Promise<readonly HomeMapSummary[]> {
  return api().call(E.listHomeMaps, {});
}

export const homeMapSetQueryOptions = {
  queryKey: HOME_MAP_SET_QUERY_KEY,
  queryFn: fetchHomeMapSet,
  staleTime: Infinity,
  gcTime: Infinity,
} as const;

export const robotMapFeedsQueryOptions = {
  queryKey: HOME_MAP_FEEDS_QUERY_KEY,
  queryFn: (): Promise<readonly HomeMapFeed[]> => api().call(E.listRobotMapFeeds, {}),
  staleTime: Infinity,
  gcTime: Infinity,
} as const;

export function homeMapVersionsQueryOptions(mapId: string): {
  readonly queryKey: readonly unknown[];
  readonly queryFn: () => Promise<readonly HomeMapVersion[]>;
} {
  return {
    queryKey: homeMapVersionsQueryKey(mapId),
    queryFn: () => api().call(E.listHomeMapVersions, { params: { mapId } }),
  };
}

export function refetchHomeMapSet(client: QueryClient): Promise<readonly HomeMapSummary[]> {
  return client.query({ ...homeMapSetQueryOptions, staleTime: 0, networkMode: 'always' });
}

export function refetchRobotMapFeeds(client: QueryClient): Promise<readonly HomeMapFeed[]> {
  return client.query({ ...robotMapFeedsQueryOptions, staleTime: 0, networkMode: 'always' });
}

function holdsMap(client: QueryClient, key: readonly unknown[], mapId: string): HomeMap | null {
  const cached = client.getQueryData<HomeMap>(key);
  return cached?.id === mapId ? cached : null;
}

export async function refreshMapTo(
  client: QueryClient,
  mapId: string,
  revision: number,
): Promise<void> {
  const own = holdsMap(client, homeMapQueryKey(mapId), mapId);
  if (own !== null && own.revision < revision) await refetchHomeMap(client, own.id);
  const standing = holdsMap(client, homeMapQueryKey(), mapId);
  if (standing !== null && standing.revision < revision) await refetchHomeMap(client);
}

export function forgetMap(client: QueryClient, mapId: string): void {
  client.removeQueries({ queryKey: homeMapQueryKey(mapId), exact: true });
  client.removeQueries({ queryKey: homeMapVersionsQueryKey(mapId), exact: true });
  if (holdsMap(client, homeMapQueryKey(), mapId) !== null) {
    client.removeQueries({ queryKey: homeMapQueryKey(), exact: true });
  }
}

export function invalidateMapsBehind(
  client: QueryClient,
  maps: readonly HomeMapSummary[],
): Promise<void> {
  const stale = maps.flatMap((map) =>
    [homeMapQueryKey(map.id), homeMapQueryKey()].filter((key) => {
      const held = holdsMap(client, key, map.id);
      return held !== null && held.revision < map.revision;
    }),
  );
  return Promise.all(stale.map((queryKey) => client.invalidateQueries({ queryKey }))).then(
    () => undefined,
  );
}

export type HomeMapSetOutcome<T> =
  | { readonly kind: 'done'; readonly value: T }
  | { readonly kind: 'refused'; readonly message: string }
  | { readonly kind: 'unconfirmed' }
  | { readonly kind: 'offline' };

async function catchUp(client: QueryClient): Promise<void> {
  try {
    await invalidateMapsBehind(client, await refetchHomeMapSet(client));
  } catch (error) {
    log.error('home_map.set_refetch_failed', error);
  }
}

async function settleLanded(land: () => Promise<void>, name: string): Promise<void> {
  try {
    await land();
  } catch (error) {
    log.error('home_map.set_refresh_failed', error, { name });
  }
}

async function run<T>(
  client: QueryClient,
  connected: boolean,
  call: {
    readonly name: string;
    readonly send: () => Promise<T>;
    readonly land: (value: T) => Promise<void>;
  },
): Promise<HomeMapSetOutcome<T>> {
  if (!connected) return { kind: 'offline' };
  let value: T;
  try {
    value = await call.send();
  } catch (error) {
    if (error instanceof ApiError) {
      log.warn('home_map.set_refused', { name: call.name, code: error.code });
      return { kind: 'refused', message: error.message };
    }
    log.error('home_map.set_answer_lost', error, { name: call.name });
    await catchUp(client);
    return { kind: 'unconfirmed' };
  }
  await settleLanded(() => call.land(value), call.name);
  return { kind: 'done', value };
}

export interface HomeMapUpdate {
  readonly name?: string;
  readonly isDefault?: true;
  readonly position?: number;
}

export interface HomeMapSetActions {
  readonly create: (name: string) => Promise<HomeMapSetOutcome<HomeMapSummary>>;
  readonly update: (mapId: string, update: HomeMapUpdate) => Promise<HomeMapSetOutcome<unknown>>;
  readonly remove: (mapId: string) => Promise<HomeMapSetOutcome<unknown>>;
  readonly saveVersion: (
    mapId: string,
    name?: string,
  ) => Promise<HomeMapSetOutcome<HomeMapVersion>>;
  readonly restore: (mapId: string, versionId: string) => Promise<HomeMapSetOutcome<unknown>>;
  readonly reset: (mapId: string, sourceId?: string) => Promise<HomeMapSetOutcome<unknown>>;
  readonly setFeed: (
    deviceId: string,
    robotMapId: number,
    assignment: HomeMapFeedAssignment,
  ) => Promise<HomeMapSetOutcome<HomeMapFeed>>;
}

function landsOnList(client: QueryClient): () => Promise<void> {
  return async () => {
    await refetchHomeMapSet(client);
  };
}

function replaceFeed(client: QueryClient, feed: HomeMapFeed): void {
  client.setQueryData<readonly HomeMapFeed[]>(HOME_MAP_FEEDS_QUERY_KEY, (held) =>
    held?.map((item) =>
      item.deviceId === feed.deviceId && item.robotMapId === feed.robotMapId ? feed : item,
    ),
  );
}

type Go = <T>(
  name: string,
  send: () => Promise<T>,
  land: (value: T) => Promise<void>,
) => Promise<HomeMapSetOutcome<T>>;

function mapCalls(
  client: QueryClient,
  go: Go,
): Pick<HomeMapSetActions, 'create' | 'update' | 'remove'> {
  const list = landsOnList(client);
  return {
    create: (name) => go('create', () => api().call(E.createHomeMap, { body: { name } }), list),
    update: (mapId, update) =>
      go('update', () => api().call(E.updateHomeMap, { params: { mapId }, body: update }), list),
    remove: (mapId) =>
      go(
        'delete',
        () => api().call(E.deleteHomeMap, { params: { mapId } }),
        async () => {
          forgetMap(client, mapId);
          await list();
        },
      ),
  };
}

function versionCalls(
  client: QueryClient,
  go: Go,
): Pick<HomeMapSetActions, 'saveVersion' | 'restore' | 'reset'> {
  const list = landsOnList(client);
  const landsOnMap =
    (mapId: string) =>
    async (answer: { readonly revision: number }): Promise<void> => {
      await refreshMapTo(client, mapId, answer.revision);
      await list();
    };
  return {
    saveVersion: (mapId, name) =>
      go(
        'save_version',
        () =>
          api().call(E.saveHomeMapVersion, {
            params: { mapId },
            body: name === undefined ? {} : { name },
          }),
        async () => {
          await client.invalidateQueries({ queryKey: homeMapVersionsQueryKey(mapId) });
        },
      ),
    restore: (mapId, versionId) =>
      go(
        'restore_version',
        () => api().call(E.restoreHomeMapVersion, { params: { mapId, versionId } }),
        landsOnMap(mapId),
      ),
    reset: (mapId, sourceId) =>
      go(
        'reset_to_source',
        () =>
          api().call(E.resetHomeMapToSource, {
            params: { mapId },
            body: sourceId === undefined ? {} : { sourceId },
          }),
        landsOnMap(mapId),
      ),
  };
}

function feedCalls(client: QueryClient, go: Go): Pick<HomeMapSetActions, 'setFeed'> {
  const list = landsOnList(client);
  return {
    setFeed: (deviceId, robotMapId, assignment) =>
      go(
        'set_feed',
        () =>
          api().call(E.setRobotMapFeed, {
            params: { deviceId, robotMapId: String(robotMapId) },
            body: assignment,
          }),
        async (feed) => {
          replaceFeed(client, feed);
          await list();
        },
      ),
  };
}

export function homeMapSetActions(client: QueryClient, connected: boolean): HomeMapSetActions {
  const go: Go = (name, send, land) => run(client, connected, { name, send, land });
  return { ...mapCalls(client, go), ...versionCalls(client, go), ...feedCalls(client, go) };
}

export interface HomeMapSetState {
  readonly maps: readonly HomeMapSummary[] | null;
  readonly loading: boolean;
  readonly failure: Error | null;
  readonly retry: () => void;
}

export function useHomeMapSet(): HomeMapSetState {
  const query = useScreenQuery(homeMapSetQueryOptions);
  const { refetch, data } = query;
  return {
    maps: data ?? null,
    loading: query.isPending,
    failure: data === undefined && query.isError ? query.error : null,
    retry: (): void => {
      background(refetch(), 'home_map.set_refetch_failed');
    },
  };
}

export function useHomeMapVersions(mapId: string): readonly HomeMapVersion[] | null {
  return useScreenQuery(homeMapVersionsQueryOptions(mapId)).data ?? null;
}

export function useRobotMapFeeds(): readonly HomeMapFeed[] | null {
  return useScreenQuery(robotMapFeedsQueryOptions).data ?? null;
}

export function useHomeMapSetActions(): HomeMapSetActions {
  const client = useQueryClient();
  const connected = useSyncStatus().status === 'live';
  return useMemo(() => homeMapSetActions(client, connected), [client, connected]);
}
