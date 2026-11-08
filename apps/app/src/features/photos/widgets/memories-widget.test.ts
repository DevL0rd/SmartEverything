import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WIDGET_TYPE, type Memory } from '@smarteverything/domain';
import { PHOTOS_WIDGETS } from '../widgets';
import { MEMORIES_WIDGET, MEMORIES_WIDGET_COPY, MemoriesWidget } from './memories-widget';

interface QueryState<T> {
  readonly data: T | undefined;
  readonly error: Error | null;
  readonly isPending: boolean;
  readonly refetch: () => Promise<unknown>;
}

const state = vi.hoisted(
  (): {
    memories: QueryState<readonly Memory[]>;
    enabled: boolean;
    yearInReview: boolean;
    sync: string;
  } => ({
    memories: { data: undefined, error: null, isPending: true, refetch: () => Promise.resolve() },
    enabled: true,
    yearInReview: true,
    sync: 'live',
  }),
);

vi.mock('../data', () => ({
  usePhotoMemories: (): QueryState<readonly Memory[]> => state.memories,
}));
vi.mock('../../../store/prefs', () => ({
  PREFS: { photos: { defaultValue: { memories: true, yearInReview: true } } },
  usePref: (): { readonly status: 'ok'; readonly value: Record<string, boolean> } => ({
    status: 'ok',
    value: { memories: state.enabled, yearInReview: state.yearInReview },
  }),
}));
vi.mock('../../../store/selectors', () => ({
  useSyncStatus: (): { readonly status: string } => ({ status: state.sync }),
}));
vi.mock('../../../design/size-class', () => ({ useAreaWidth: (): number => 412 }));
vi.mock('../../../app-shell/hrefs', () => ({
  href: {
    photos: (): string => '/photos',
    photosPage: (page: string): string => `/photos/${page}`,
    settings: { page: (page: string): string => `/settings/${page}` },
  },
}));
vi.mock('../../../components/widget-board', () => ({
  WidgetFrame: ({
    title,
    badge,
    actions,
    children,
  }: {
    readonly title: string;
    readonly badge?: ReactNode;
    readonly actions?: ReactNode;
    readonly children: ReactNode;
  }): ReactNode => createElement('section', { 'data-title': title }, badge, children, actions),
  WidgetHeader: ({
    title,
    badge,
  }: {
    readonly title: string;
    readonly badge?: ReactNode;
  }): ReactNode => createElement('header', { 'data-title': title }, badge),
  WidgetSurface: ({ children }: { readonly children: ReactNode }): ReactNode =>
    createElement('section', {}, children),
  WidgetEmpty: ({
    title,
    action,
  }: {
    readonly title: string;
    readonly action?: { readonly label: string; readonly href: string };
  }): ReactNode =>
    createElement(
      'p',
      {},
      title,
      action === undefined ? null : createElement('a', { href: action.href }),
    ),
}));
vi.mock('../../../components/button', () => ({
  Button: ({ label }: { readonly label: string }): ReactNode => createElement('button', {}, label),
}));
vi.mock('../../../components/error-state', () => ({
  ErrorState: ({ error }: { readonly error: Error }): ReactNode =>
    createElement('p', { role: 'alert' }, error.message),
}));
vi.mock('../../../components/skeleton', () => ({
  Skeleton: (): ReactNode => createElement('i', { 'data-skeleton': 'block' }),
}));
vi.mock('./memory-tile', () => ({
  MemoryTile: ({ label, action }: { readonly label: string; readonly action: string }): ReactNode =>
    createElement('i', { 'data-tile': label, 'aria-label': action }),
}));
vi.mock('../memories/memory-player', () => ({ MemoryPlayer: (): null => null }));

const COVER = '0b9f8a4e-0000-4000-8000-000000000001';

function hero(yearsAgo: number): Memory {
  const year = String(2026 - yearsAgo);
  return {
    id: `on_this_day:${String(yearsAgo)}`,
    kind: 'on_this_day',
    yearsAgo,
    from: `${year}-11-07`,
    to: `${year}-11-07`,
    count: 10 * yearsAgo,
    coverItemId: COVER,
  };
}

const TRIP: Memory = {
  id: 'trip:1',
  kind: 'trip',
  from: '2025-04-01',
  to: '2025-04-08',
  count: 300,
  coverItemId: COVER,
  placeId: 7,
  placeName: 'Japan',
  distanceFromHomeKm: null,
  places: 1,
  perDay: [{ day: '2025-04-01', count: 1 }],
};

const DAY_OUT: Memory = {
  id: 'day_out:1',
  kind: 'day_out',
  from: '2026-10-12',
  to: '2026-10-12',
  count: 30,
  coverItemId: COVER,
  placeId: null,
  placeName: null,
};

const ALL: readonly Memory[] = [TRIP, hero(5), DAY_OUT, hero(1), hero(3)];

function query(data: readonly Memory[] | undefined, error: Error | null = null): void {
  state.memories = {
    data,
    error,
    isPending: data === undefined && error === null,
    refetch: (): Promise<void> => Promise.resolve(),
  };
}

function render(size: 'M' | 'W'): string {
  return renderToStaticMarkup(createElement(MemoriesWidget, { size, editing: false }));
}

describe('home memories widget', () => {
  it('registers one memories widget with a type a board layout can save', () => {
    expect(PHOTOS_WIDGETS).toEqual([MEMORIES_WIDGET]);
    expect(WIDGET_TYPE.safeParse(MEMORIES_WIDGET.type).success).toBe(true);
  });

  it('offers only the wide and double wide sizes', () => {
    expect(MEMORIES_WIDGET.sizes).toEqual({
      compact: ['M', 'W'],
      medium: ['M', 'W'],
      expanded: ['M', 'W'],
    });
  });

  it('shows a placeholder while memories load', () => {
    query(undefined);
    expect(render('M')).toContain('data-skeleton="block"');
  });

  it('shows the error with a retry when memories fail', () => {
    query(undefined, new Error('Memories unavailable'));
    const markup = render('W');
    expect(markup).toContain('role="alert">Memories unavailable');
    expect(markup).toContain('Try again');
  });

  it('puts the latest year on the cover with two side years, the count and the day', () => {
    query(ALL);
    const markup = render('M');
    expect(markup).toContain('data-title="On this day"');
    expect(markup).toContain('>7 November<');
    expect(markup).toContain('data-tile="2025 · 1 year ago"');
    expect(markup).toContain('data-tile="2023"');
    expect(markup).toContain('data-tile="2021"');
    expect(markup).toContain('90 items from 3 years');
    expect(markup).not.toContain('Japan');
  });

  it('stacks the two side years in one column beside the cover', () => {
    query(ALL);
    const markup = render('M');
    const column = /data-testid="memories-side-column"[^>]*>(.*?)<\/div>/.exec(markup);
    expect(column?.[1]?.match(/data-tile=/g)).toHaveLength(2);
    expect(column?.[1]).not.toContain('1 year ago');
  });

  it('draws no side column when only one year has memories', () => {
    query([hero(2)]);
    expect(render('M')).not.toContain('memories-side-column');
  });

  it('says nothing came from this day when there are only other memories', () => {
    query([TRIP]);
    const markup = render('M');
    expect(markup).toContain(MEMORIES_WIDGET_COPY.none.title);
    expect(markup).toContain('href="/photos/memories"');
  });

  it('draws three memory tiles with Play on the double wide face', () => {
    query(ALL);
    const markup = render('W');
    expect(markup).toContain('data-title="Memories"');
    expect(markup).toContain('5 memories');
    expect(markup).toContain('>Play</button>');
    expect(markup.match(/data-tile=/g)).toHaveLength(3);
    expect(markup).toContain('aria-label="Play 7 November 2025"');
    expect(markup).not.toContain('Trip: Japan');
  });

  it('says there are no memories yet when the board is empty', () => {
    query([]);
    const markup = render('W');
    expect(markup).toContain(MEMORIES_WIDGET_COPY.empty.title);
    expect(markup).toContain('href="/photos"');
  });

  it('keeps the last memories and says the hub is offline', () => {
    query(ALL);
    state.sync = 'interrupted';
    const markup = render('M');
    expect(markup).toContain(MEMORIES_WIDGET_COPY.offline);
    expect(markup).toContain('data-tile="2025 · 1 year ago"');
    state.sync = 'live';
  });

  it('says the hub is offline instead of loading forever when nothing was kept', () => {
    query(undefined);
    state.sync = 'interrupted';
    const markup = render('W');
    expect(markup).toContain(MEMORIES_WIDGET_COPY.unreachable.title);
    expect(markup).not.toContain('data-skeleton');
    state.sync = 'live';
  });

  it('points to the settings when memories are off', () => {
    state.enabled = false;
    const markup = render('W');
    expect(markup).toContain(MEMORIES_WIDGET_COPY.off.title);
    expect(markup).toContain('href="/settings/photos"');
    expect(markup).not.toContain('data-tile');
    state.enabled = true;
  });
});
