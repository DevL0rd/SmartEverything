import {
  act,
  createElement,
  Fragment,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryBucket } from '@smarteverything/domain';
import type { MediaActions } from './use-media-actions';

interface MonthState {
  readonly ids: readonly (readonly string[])[];
  readonly loaded: number;
  readonly fetching: boolean;
}

interface Store {
  months: Map<string, MonthState>;
  listeners: Set<() => void>;
  version: number;
}

const store = vi.hoisted((): Store => ({ months: new Map(), listeners: new Set(), version: 0 }));

function publish(): void {
  store.version += 1;
  for (const listener of store.listeners) listener();
}

function setMonth(month: string, change: Partial<MonthState>): void {
  const current = store.months.get(month);
  if (current === undefined) throw new Error(`No month ${month}`);
  store.months.set(month, { ...current, ...change });
  publish();
}

const BUCKETS: readonly LibraryBucket[] = [
  { month: '2026-11', count: 4 },
  { month: '2026-10', count: 4 },
  { month: '2026-09', count: 2 },
];

function pageOf(ids: readonly string[], next: string | null): unknown {
  return {
    ids,
    revs: ids.map(() => 1),
    aspect: ids.map(() => 1),
    takenAt: ids.map((_, index) => Date.UTC(2026, 10, 1) - index),
    offsetMin: ids.map(() => 0),
    durationMs: ids.map(() => null),
    flags: ids.map(() => 0),
    next,
  };
}

const views = new Map<string, { readonly version: number; readonly view: unknown }>();

function monthView(month: string, fetchNext: () => Promise<void>): unknown {
  const cached = views.get(month);
  if (cached?.version === store.version) return cached.view;
  const state = store.months.get(month);
  if (state === undefined) throw new Error(`No month ${month}`);
  const pages = state.ids
    .slice(0, state.loaded)
    .map((ids, index) =>
      pageOf(ids, index + 1 < state.ids.length ? `c${String(index + 1)}` : null),
    );
  const view = {
    data: state.loaded === 0 ? undefined : { pages, pageParams: [] },
    hasNextPage: state.loaded > 0 && state.loaded < state.ids.length,
    isFetching: state.fetching,
    isError: false,
    fetchNextPage: fetchNext,
    refetch: (): Promise<void> => Promise.resolve(),
  };
  views.set(month, { version: store.version, view });
  return view;
}

const fetchers = new Map<string, () => Promise<void>>();

function fetcherOf(month: string): () => Promise<void> {
  const known = fetchers.get(month);
  if (known !== undefined) return known;
  const fetch = (): Promise<void> => {
    setMonth(month, { fetching: true });
    return Promise.resolve();
  };
  fetchers.set(month, fetch);
  return fetch;
}

const BUCKET_QUERY = { data: BUCKETS, isError: false, dataUpdatedAt: 1, refetch: vi.fn() };

vi.mock('../data', () => ({
  usePhotoBuckets: (): unknown => BUCKET_QUERY,
  usePhotoMonth: (month: string): unknown => {
    useSyncExternalStore(
      (listener) => {
        store.listeners.add(listener);
        return (): void => {
          store.listeners.delete(listener);
        };
      },
      () => store.version,
    );
    return monthView(month, fetcherOf(month));
  },
}));

vi.mock('./phone-merge', () => ({ useLocalMerge: <T>(tiles: T): T => tiles }));

const { useMediaSelection } = await import('../../../components/media-grid/selection');
const { feedSelectionOf, selectAllScopeOf, useLibraryFeed } = await import('./use-library-feed');
const { pickedOf } = await import('./selection-model');

function noop(): void {
  return undefined;
}

const MEDIA: MediaActions = {
  chatHint: null,
  albums: () => [],
  favourite: noop,
  toChat: noop,
  share: noop,
  download: noop,
  showInDrive: noop,
  ask: noop,
  trash: noop,
};

interface Seen {
  readonly actions: boolean;
  readonly locked: boolean;
  readonly ids: number;
}

const seen: Seen[] = [];
const handle: { selectAll: (() => void) | null } = { selectAll: null };

const SCOPE = { filter: 'all' } as const;

function Probe(): ReactNode {
  const feed = useLibraryFeed(SCOPE);
  const controls = useMediaSelection(feed.tiles.map((tile) => tile.id));
  const { onAll } = selectAllScopeOf(feed, controls.all);
  useEffect(() => {
    handle.selectAll = onAll;
  });
  const picked = pickedOf(feedSelectionOf(feed, controls, MEDIA));
  if (controls.selection.active) {
    seen.push({ actions: !picked.none, locked: picked.locked, ids: picked.ids.length });
  }
  return createElement(Fragment, null, feed.sources);
}

function settleFetches(): void {
  for (const [month, state] of store.months) {
    if (state.fetching) {
      store.months.set(month, {
        ...state,
        fetching: false,
        loaded: Math.min(state.loaded + 1, state.ids.length),
      });
    }
  }
  publish();
}

const RENDER_BUDGET = 40;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  store.months = new Map([
    [
      '2026-11',
      {
        ids: [
          ['a1', 'a2'],
          ['a3', 'a4'],
        ],
        loaded: 1,
        fetching: false,
      },
    ],
    [
      '2026-10',
      {
        ids: [
          ['b1', 'b2'],
          ['b3', 'b4'],
        ],
        loaded: 1,
        fetching: false,
      },
    ],
    ['2026-09', { ids: [['c1', 'c2']], loaded: 1, fetching: false }],
  ]);
  publish();
});

afterEach(() => {
  vi.unstubAllGlobals();
  seen.length = 0;
  views.clear();
  fetchers.clear();
  handle.selectAll = null;
});

describe('Select all in the photo library', () => {
  it('keeps the actions mounted while the rest loads and through later refreshes', async () => {
    const root = createRoot({
      nodeType: 1,
      tagName: 'DIV',
      ownerDocument: null,
      addEventListener: (): void => undefined,
    });
    act(() => {
      root.render(createElement(Probe));
    });
    await act(async () => {
      handle.selectAll?.();
      await Promise.resolve();
    });
    for (let round = 0; round < 4; round += 1) {
      await act(async () => {
        settleFetches();
        await Promise.resolve();
      });
    }
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((render) => render.actions)).toBe(true);
    const last = seen.at(-1);
    expect(last).toEqual({ actions: true, locked: false, ids: 10 });
    const firstReady = seen.findIndex((render) => !render.locked);
    expect(seen.slice(firstReady).every((render) => !render.locked)).toBe(true);
    const ready = seen.length;
    await act(async () => {
      for (const month of store.months.keys()) setMonth(month, { fetching: true });
      await Promise.resolve();
    });
    await act(async () => {
      for (const month of store.months.keys()) setMonth(month, { fetching: false });
      await Promise.resolve();
    });
    const refreshed = seen.slice(ready);
    expect(refreshed.length).toBeGreaterThan(0);
    expect(refreshed.every((render) => render.actions && !render.locked && render.ids === 10)).toBe(
      true,
    );
    expect(seen.length).toBeLessThanOrEqual(RENDER_BUDGET);
    act(() => {
      root.unmount();
    });
  });
});
