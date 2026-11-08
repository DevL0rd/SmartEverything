import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Memory, Trip } from '@smarteverything/domain';
import { MemoriesScreen, MEMORIES_COPY } from './memories-screen';

interface QueryState<T> {
  readonly data: T | undefined;
  readonly error: Error | null;
  readonly isPending: boolean;
  readonly refetch: () => Promise<unknown>;
}

const state = vi.hoisted(
  (): {
    memories: QueryState<readonly Memory[]>;
    trips: QueryState<readonly Trip[]>;
    enabled: boolean;
    sync: string;
  } => ({
    memories: { data: undefined, error: null, isPending: true, refetch: () => Promise.resolve() },
    trips: { data: undefined, error: null, isPending: true, refetch: () => Promise.resolve() },
    enabled: true,
    sync: 'live',
  }),
);

vi.mock('../components/photos-frame', () => ({
  PhotosFrame: ({
    children,
    active,
  }: {
    readonly children: ReactNode;
    readonly active: string;
  }): ReactNode => createElement('main', { 'data-active': active }, children),
}));
vi.mock('../data', () => ({
  usePhotoMemories: (): QueryState<readonly Memory[]> => state.memories,
  usePhotoTrips: (): QueryState<readonly Trip[]> => state.trips,
}));
vi.mock('../../../store/prefs', () => ({
  PREFS: { photos: { defaultValue: { memories: true, yearInReview: true } } },
  usePref: (): { readonly status: 'ok'; readonly value: Record<string, boolean> } => ({
    status: 'ok',
    value: { memories: state.enabled, yearInReview: true },
  }),
}));
vi.mock('../../../store/selectors', () => ({
  useSyncStatus: (): { readonly status: string } => ({ status: state.sync }),
}));
vi.mock('../../../design/size-class', () => ({ useAreaWidth: (): number => 1360 }));
vi.mock('../../../app-shell/hrefs', () => ({
  href: {
    photos: (): string => '/photos',
    settings: { page: (page: string): string => `/settings/${page}` },
  },
}));
vi.mock('../../../components/banner', () => ({
  Banner: ({ title }: { readonly title: string }): ReactNode => createElement('aside', {}, title),
}));
vi.mock('../../../components/button', () => ({
  Button: ({ label, href }: { readonly label: string; readonly href: string }): ReactNode =>
    createElement('a', { href }, label),
}));
vi.mock('../../../components/empty-state', () => ({
  EmptyState: ({
    title,
    action,
  }: {
    readonly title: string;
    readonly action: ReactNode;
  }): ReactNode => createElement('section', {}, title, action),
}));
vi.mock('../../../components/error-state', () => ({
  ErrorState: ({ error }: { readonly error: Error }): ReactNode =>
    createElement('p', { role: 'alert' }, error.message),
}));
vi.mock('./memories-board', () => ({
  BoardSkeleton: (): ReactNode => createElement('i', { 'data-skeleton': 'board' }),
  MemoriesBoard: ({ board }: { readonly board: { readonly hero: readonly Memory[] } }): ReactNode =>
    createElement('div', { 'data-hero': board.hero.length }),
}));
vi.mock('./memory-player', () => ({ MemoryPlayer: (): null => null }));

const HERO: Memory = {
  id: 'on_this_day:3',
  kind: 'on_this_day',
  yearsAgo: 3,
  from: '2023-11-07',
  to: '2023-11-07',
  count: 40,
  coverItemId: '0b9f8a4e-0000-4000-8000-000000000001',
};

function query<T>(data: T | undefined, error: Error | null = null): QueryState<T> {
  return {
    data,
    error,
    isPending: data === undefined && error === null,
    refetch: () => Promise.resolve(),
  };
}

function render(): string {
  return renderToStaticMarkup(createElement(MemoriesScreen));
}

describe('memories page states', () => {
  it('shows the board placeholder while memories load', () => {
    state.memories = query<readonly Memory[]>(undefined);
    state.trips = query<readonly Trip[]>(undefined);
    const markup = render();
    expect(markup).toContain('data-active="memories"');
    expect(markup).toContain('data-skeleton="board"');
  });

  it('shows the error instead of the placeholder when memories fail', () => {
    state.memories = query<readonly Memory[]>(undefined, new Error('Memories unavailable'));
    const markup = render();
    expect(markup).toContain('role="alert">Memories unavailable');
    expect(markup).not.toContain('data-skeleton');
  });

  it('says there are no memories once memories and trips load empty', () => {
    state.memories = query<readonly Memory[]>([]);
    state.trips = query<readonly Trip[]>([]);
    const markup = render();
    expect(markup).toContain(MEMORIES_COPY.empty.title);
    expect(markup).toContain('href="/photos"');
  });

  it('waits for trips before calling the page empty', () => {
    state.memories = query<readonly Memory[]>([]);
    state.trips = query<readonly Trip[]>(undefined);
    expect(render()).not.toContain(MEMORIES_COPY.empty.title);
  });

  it('draws the board with the memories it has', () => {
    state.memories = query<readonly Memory[]>([HERO]);
    state.trips = query<readonly Trip[]>([]);
    expect(render()).toContain('data-hero="1"');
  });

  it('keeps the last memories on screen and says the hub is offline', () => {
    state.sync = 'interrupted';
    const markup = render();
    expect(markup).toContain(MEMORIES_COPY.offline.title);
    expect(markup).toContain('data-hero="1"');
    state.sync = 'live';
  });

  it('points to the settings when memories are off', () => {
    state.enabled = false;
    const markup = render();
    expect(markup).toContain(MEMORIES_COPY.off.title);
    expect(markup).toContain('href="/settings/photos"');
    expect(markup).not.toContain('data-hero');
    state.enabled = true;
  });
});
