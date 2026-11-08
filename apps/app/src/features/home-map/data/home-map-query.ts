import { useEffect, useMemo } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  type HomeMap,
  type HomeMapActor,
  type HomeMapId,
  type HomeMapOp,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { api } from '../../../api/transport';
import { usePausable } from '../../../design/external-store';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { useSyncStatus } from '../../../store/selectors';
import {
  HomeMapEditor,
  type HomeMapEditorApi,
  type HomeMapEditorDeps,
  type HomeMapEditorState,
  type HomeMapSaveStatus,
} from './edits';

export const HOME_MAP_QUERY_KEY = ['window', 'home-map', 'map'] as const;

const DEFAULT_MAP = 'default' as const;

export function homeMapQueryKey(mapId?: string): readonly unknown[] {
  return [...HOME_MAP_QUERY_KEY, mapId === undefined ? DEFAULT_MAP : { id: mapId }];
}

function mapQuery(mapId: HomeMapId | undefined): {
  readonly view: 'full';
  readonly mapId?: HomeMapId;
} {
  return mapId === undefined ? { view: 'full' } : { view: 'full', mapId };
}

function mapScope(mapId: HomeMapId | undefined): {
  readonly query?: { readonly mapId: HomeMapId };
} {
  return mapId === undefined ? {} : { query: { mapId } };
}

export class HomeMapNotFullError extends Error {
  override readonly name = 'HomeMapNotFullError';

  constructor() {
    super('The server answered the house map without its outlines.');
  }
}

export async function fetchHomeMap(mapId?: HomeMapId): Promise<HomeMap> {
  const answer = await api().call(E.getHomeMap, { query: mapQuery(mapId) });
  if ('view' in answer) throw new HomeMapNotFullError();
  return answer;
}

export function homeMapQueryOptions(mapId?: HomeMapId): {
  readonly queryKey: readonly unknown[];
  readonly queryFn: () => Promise<HomeMap>;
  readonly staleTime: number;
  readonly gcTime: number;
} {
  return {
    queryKey: homeMapQueryKey(mapId),
    queryFn: (): Promise<HomeMap> => fetchHomeMap(mapId),
    staleTime: Infinity,
    gcTime: Infinity,
  };
}

export function refetchHomeMap(client: QueryClient, mapId?: HomeMapId): Promise<HomeMap> {
  return client.query({ ...homeMapQueryOptions(mapId), staleTime: 0, networkMode: 'always' });
}

export function homeMapEditorApi(mapId?: HomeMapId): HomeMapEditorApi {
  const scope = mapScope(mapId);
  return {
    edit: (batch) => api().call(E.editHomeMap, { body: batch, ...scope }),
    undo: () => api().call(E.undoHomeMap, { ...scope }),
    redo: () => api().call(E.redoHomeMap, { ...scope }),
    revisions: (actor, after) =>
      api().call(E.listHomeMapRevisions, { query: { actor, after, ...scope.query } }),
  };
}

export function homeMapEditorDeps(
  client: QueryClient,
  actor: HomeMapActor,
  mapId?: HomeMapId,
): HomeMapEditorDeps {
  const key = homeMapQueryKey(mapId);
  return {
    actor,
    api: homeMapEditorApi(mapId),
    now: (): string => new Date().toISOString(),
    read: (): HomeMap | undefined => client.getQueryData<HomeMap>(key),
    write: (map): void => {
      client.setQueryData(key, map);
      if (mapId === undefined) client.setQueryData(homeMapQueryKey(map.id), map);
    },
    refetch: (): Promise<HomeMap> => refetchHomeMap(client, mapId),
  };
}

export interface HomeMapState {
  readonly map: HomeMap | null;
  readonly loading: boolean;
  readonly failure: Error | null;
  readonly retry: () => void;
}

export function useHomeMap(mapId?: HomeMapId): HomeMapState {
  const query = useScreenQuery(homeMapQueryOptions(mapId));
  const { refetch, data } = query;
  return {
    map: data ?? null,
    loading: query.isPending,
    failure: data === undefined && query.isError ? query.error : null,
    retry: (): void => {
      background(refetch(), 'home_map.refetch_failed');
    },
  };
}

export interface HomeMapEditing {
  readonly state: HomeMapEditorState;
  readonly edit: (ops: readonly HomeMapOp[]) => Promise<HomeMapSaveStatus>;
  readonly undo: () => Promise<HomeMapSaveStatus>;
  readonly redo: () => Promise<HomeMapSaveStatus>;
  readonly dismiss: () => void;
}

export function useHomeMapEditing(actor: HomeMapActor, mapId?: HomeMapId): HomeMapEditing {
  const client = useQueryClient();
  const connected = useSyncStatus().status === 'live';
  const editor = useMemo(
    () => new HomeMapEditor(homeMapEditorDeps(client, actor, mapId)),
    [client, actor, mapId],
  );
  useEffect(() => {
    editor.setConnected(connected);
  }, [editor, connected]);
  const raw = usePausable(editor.subscribe, editor.read);
  const state = useMemo(() => ({ ...raw, connected }), [raw, connected]);
  return {
    state,
    edit: editor.edit,
    undo: editor.undo,
    redo: editor.redo,
    dismiss: editor.dismiss,
  };
}
