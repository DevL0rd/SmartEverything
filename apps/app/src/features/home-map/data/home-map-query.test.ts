import { act, createElement, useLayoutEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  HOME_MAP,
  HOME_MAP_MAP_ID,
  type HomeMap,
  type HomeMapOp,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Call {
  readonly endpoint: unknown;
  readonly request: unknown;
}

const calls = vi.hoisted(() => new Array<Call>());
const served = vi.hoisted((): { answer: unknown } => ({ answer: null }));
const link = vi.hoisted(() => ({ status: 'live' }));

vi.mock('../../../api/transport', () => ({
  api: (): { call: (endpoint: unknown, request: unknown) => Promise<unknown> } => ({
    call: (endpoint, request): Promise<unknown> => {
      calls.push({ endpoint, request });
      return Promise.resolve(served.answer);
    },
  }),
}));

vi.mock('@react-native-community/netinfo', () => ({ default: {} }));

vi.mock('../../../store/selectors', () => ({
  useSyncStatus: (): { status: string } => ({ status: link.status }),
}));

const {
  HomeMapNotFullError,
  fetchHomeMap,
  homeMapEditorApi,
  homeMapEditorDeps,
  homeMapQueryKey,
  homeMapQueryOptions,
  refetchHomeMap,
  useHomeMap,
  useHomeMapEditing,
} = await import('./home-map-query');

const { makeQueryClient } = await import('../../../queries/client');

const HOME_MAP_QUERY_KEY = homeMapQueryKey();

const CABIN = HOME_MAP_MAP_ID.parse('cabin');

const AT = '2026-10-25T11:00:00.000Z';

const mapAt = (revision: number, id = 'home'): HomeMap =>
  HOME_MAP.parse({
    id,
    schemaVersion: 1,
    revision,
    name: 'House',
    north: 0,
    updatedAt: AT,
    sources: [],
    notices: [],
    floors: [],
  });

const compact = { view: 'compact', revision: 4, name: 'House', floors: [] };

const setName: HomeMapOp = { op: 'setMap', patch: { name: 'Home' } };

beforeEach(() => {
  calls.length = 0;
  link.status = 'live';
});

describe('reading the map', () => {
  it('asks for the full map and returns it', async () => {
    served.answer = mapAt(5);
    expect((await fetchHomeMap()).revision).toBe(5);
    expect(calls).toStrictEqual([{ endpoint: E.getHomeMap, request: { query: { view: 'full' } } }]);
  });

  it('refuses a compact answer, which has no outlines to draw', async () => {
    served.answer = compact;
    await expect(fetchHomeMap()).rejects.toBeInstanceOf(HomeMapNotFullError);
  });

  it('refetches into the cache even when the app thinks it is offline', async () => {
    const client = new QueryClient();
    served.answer = mapAt(7);
    await refetchHomeMap(client);
    expect(client.getQueryData<HomeMap>(HOME_MAP_QUERY_KEY)?.revision).toBe(7);
    client.clear();
  });

  it('keeps the last map for as long as the app runs, so it can be read offline', () => {
    expect(homeMapQueryOptions().gcTime).toBe(Infinity);
    expect(homeMapQueryOptions().staleTime).toBe(Infinity);
    expect(homeMapQueryOptions(CABIN).gcTime).toBe(Infinity);
  });
});

describe('reading one map of several', () => {
  it('asks for the map it names and for the default map when it names none', async () => {
    served.answer = mapAt(3, 'cabin');
    expect((await fetchHomeMap(CABIN)).id).toBe('cabin');
    expect(calls).toStrictEqual([
      { endpoint: E.getHomeMap, request: { query: { view: 'full', mapId: 'cabin' } } },
    ]);
    calls.length = 0;
    await fetchHomeMap();
    expect(calls).toStrictEqual([{ endpoint: E.getHomeMap, request: { query: { view: 'full' } } }]);
  });

  it('keeps every map and the default map under their own cache keys', () => {
    const keys = [homeMapQueryKey(), homeMapQueryKey('home'), homeMapQueryKey('default')];
    expect(new Set(keys.map((key) => JSON.stringify(key))).size).toBe(3);
    expect(homeMapQueryOptions(CABIN).queryKey).toStrictEqual(homeMapQueryKey('cabin'));
  });

  it('refetches the named map by revision into its own entry', async () => {
    const held = new QueryClient();
    held.setQueryData(homeMapQueryKey('home'), mapAt(2));
    served.answer = mapAt(9, 'cabin');
    await refetchHomeMap(held, CABIN);
    expect(held.getQueryData<HomeMap>(homeMapQueryKey('cabin'))?.revision).toBe(9);
    expect(held.getQueryData<HomeMap>(homeMapQueryKey('home'))?.revision).toBe(2);
    held.clear();
  });

  it('sends the map on every edit call and leaves it off for the default map', async () => {
    served.answer = { revision: 6, conflicts: [] };
    const api = homeMapEditorApi(CABIN);
    await api.edit({ baseRevision: 5, ops: [setName] });
    await api.undo();
    await api.redo();
    await api.revisions('profile:alice', 5);
    expect(calls).toStrictEqual([
      {
        endpoint: E.editHomeMap,
        request: { body: { baseRevision: 5, ops: [setName] }, query: { mapId: 'cabin' } },
      },
      { endpoint: E.undoHomeMap, request: { query: { mapId: 'cabin' } } },
      { endpoint: E.redoHomeMap, request: { query: { mapId: 'cabin' } } },
      {
        endpoint: E.listHomeMapRevisions,
        request: { query: { actor: 'profile:alice', after: 5, mapId: 'cabin' } },
      },
    ]);
  });

  it('writes an edit of the default map under the id it turned out to be', () => {
    const held = new QueryClient();
    held.setQueryData(homeMapQueryKey(), mapAt(5));
    const deps = homeMapEditorDeps(held, 'profile:alice');
    deps.write(mapAt(6));
    expect(held.getQueryData<HomeMap>(homeMapQueryKey())?.revision).toBe(6);
    expect(held.getQueryData<HomeMap>(homeMapQueryKey('home'))?.revision).toBe(6);
    const named = homeMapEditorDeps(held, 'profile:alice', CABIN);
    named.write(mapAt(1, 'cabin'));
    expect(held.getQueryData<HomeMap>(homeMapQueryKey('cabin'))?.revision).toBe(1);
    expect(held.getQueryData<HomeMap>(homeMapQueryKey())?.id).toBe('home');
    held.clear();
  });
});

describe('the calls an edit makes', () => {
  it('sends batches, undo, redo and the revision list to their endpoints', async () => {
    served.answer = { revision: 6, conflicts: [] };
    const api = homeMapEditorApi();
    await api.edit({ baseRevision: 5, ops: [setName] });
    await api.undo();
    await api.redo();
    await api.revisions('profile:alice', 5);
    expect(calls).toStrictEqual([
      { endpoint: E.editHomeMap, request: { body: { baseRevision: 5, ops: [setName] } } },
      { endpoint: E.undoHomeMap, request: {} },
      { endpoint: E.redoHomeMap, request: {} },
      {
        endpoint: E.listHomeMapRevisions,
        request: { query: { actor: 'profile:alice', after: 5 } },
      },
    ]);
  });
});

type Editing = ReturnType<typeof useHomeMapEditing>;

let root: Root | null = null;
let client: QueryClient | null = null;

function mount(): () => Editing | null {
  let latest: Editing | null = null;
  function Probe(): ReactNode {
    latest = useHomeMapEditing('profile:alice');
    return null;
  }
  const made = new QueryClient();
  client = made;
  made.setQueryData(HOME_MAP_QUERY_KEY, mapAt(5));
  const created = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  root = created;
  act(() => {
    created.render(createElement(QueryClientProvider, { client: made }, createElement(Probe)));
  });
  return (): Editing | null => latest;
}

function renderedHooks(): void {
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('window', {
      event: undefined,
      document: { activeElement: null, body: null },
      HTMLIFrameElement: Date,
    });
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    client?.clear();
    vi.unstubAllGlobals();
  });
}

describe('the editing hook', () => {
  renderedHooks();

  it('edits through the hub while the live link is up', async () => {
    const editing = mount();
    served.answer = { revision: 6, conflicts: [] };
    await act(async () => {
      await editing()?.edit([setName]);
    });
    expect(calls.map((call) => call.endpoint)).toStrictEqual([E.editHomeMap]);
    expect(client?.getQueryData<HomeMap>(HOME_MAP_QUERY_KEY)?.name).toBe('Home');
    expect(editing()?.state).toMatchObject({ connected: true, canUndo: true });
  });

  it('stays read only and says so while the live link is down', async () => {
    link.status = 'interrupted';
    const editing = mount();
    await act(async () => {
      await editing()?.edit([setName]);
    });
    expect(calls).toStrictEqual([]);
    expect(editing()?.state.connected).toBe(false);
    expect(client?.getQueryData<HomeMap>(HOME_MAP_QUERY_KEY)?.revision).toBe(5);
  });
});

function mountReader(landed: HomeMap): () => HomeMap | null {
  let latest: HomeMap | null = null;
  const made = makeQueryClient();
  client = made;
  function Reader(): ReactNode {
    latest = useHomeMap().map;
    return null;
  }
  function Landing(): ReactNode {
    useLayoutEffect(() => {
      made.setQueryData(HOME_MAP_QUERY_KEY, landed);
    }, []);
    return null;
  }
  const created = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  root = created;
  act(() => {
    created.render(
      createElement(
        QueryClientProvider,
        { client: made },
        createElement(Reader),
        createElement(Landing),
      ),
    );
  });
  return (): HomeMap | null => latest;
}

describe('the map hook', () => {
  renderedHooks();

  it('shows a map that lands after the first render and before the screen subscribes', async () => {
    served.answer = new Promise(() => undefined);
    const read = mountReader(mapAt(7));
    await act(async () => {
      await Promise.resolve();
    });
    expect(read()?.revision).toBe(7);
  });
});
