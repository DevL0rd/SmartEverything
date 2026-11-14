import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

interface Query {
  data: unknown;
  isError: boolean;
  error: unknown;
}

interface State {
  query: Query;
  counts: unknown;
  live: boolean;
  owner: boolean;
}

const state = vi.hoisted((): State => ({
  query: { data: undefined, isError: false, error: null },
  counts: { library: 10, favourites: 1 },
  live: true,
  owner: true,
}));

interface Props {
  readonly children?: ReactNode;
  readonly banner?: ReactNode;
}

function stub(name: string): (props: Props) => ReactNode {
  return function Part({ children }: Props): ReactNode {
    return createElement('section', { 'data-part': name }, children);
  };
}

vi.mock('react-native', () => ({
  View: ({ children }: Props): ReactNode => createElement('div', null, children),
}));
vi.mock('../components/photos-frame', () => ({
  PhotosFrame: ({ children, banner }: Props): ReactNode =>
    createElement('main', null, banner, children),
  PHOTOS_BACKUP_SETTINGS_HREF: '/settings/photos/backup',
}));
vi.mock('../data', () => ({
  usePhotoInsights: (): Query => state.query,
  usePhotoRailCounts: (): { readonly data: unknown } => ({ data: state.counts }),
}));
vi.mock('../../../store/clock', () => ({ useDayKey: (): string => '2026-11-07' }));
vi.mock('../../../store/selectors', () => ({
  useIsOwner: (): boolean => state.owner,
  useSyncStatus: (): { readonly status: string } => ({ status: state.live ? 'live' : 'offline' }),
}));
vi.mock('../../../design/size-class', () => ({
  useSizeClass: (): { readonly width: string } => ({ width: 'expanded' }),
}));
vi.mock('../../../components/segmented', () => ({ Segmented: stub('range') }));
vi.mock('../../../components/metric-strip', () => ({ MetricStrip: stub('stats') }));
vi.mock('./insights-charts', () => ({
  CalendarCard: stub('calendar'),
  GrowthCard: stub('growth'),
  KindsCard: stub('kinds'),
  SeasonCard: stub('season'),
  WeekCard: stub('week'),
}));
vi.mock('./insights-lists', () => ({
  CamerasCard: stub('cameras'),
  CoverageCard: stub('coverage'),
  FoldersCard: stub('folders'),
  LargestVideos: stub('largest'),
  PlacesCard: stub('places'),
}));
vi.mock('./insights-states', () => ({
  InsightsEmpty: stub('empty'),
  InsightsError: stub('error'),
  InsightsOffline: stub('offline'),
  InsightsSkeleton: stub('loading'),
  RangeEmpty: stub('range-empty'),
  StaleBanner: stub('stale'),
  YoungCard: stub('young'),
}));

const { InsightsScreen } = await import('./insights-screen');

const parts = (): readonly string[] =>
  [...renderToStaticMarkup(createElement(InsightsScreen)).matchAll(/data-part="([^"]+)"/gu)].map(
    (match) => match[1] ?? '',
  );

const FULL = {
  items: 3,
  growth: [],
  kinds: [],
  places: { places: 0, countries: [] },
  backupCoverage: [],
  roots: [],
  largestVideos: [],
  videoTotals: { items: 0, bytes: 0, durationMs: 0, longestMs: null },
};

afterEach(() => {
  state.query = { data: undefined, isError: false, error: null };
  state.live = true;
  state.owner = true;
});

describe('Insights screen states', () => {
  it('shows the range control and a skeleton while the hub answers', () => {
    expect(parts()).toEqual(['range', 'loading']);
  });

  it('tells an offline hub from a failed read', () => {
    state.query = { data: undefined, isError: true, error: new Error('nope') };
    expect(parts()).toContain('error');
    state.live = false;
    expect(parts()).toContain('offline');
  });

  it('keeps the last insights under a banner when the hub drops', () => {
    state.query = { data: FULL, isError: true, error: new Error('gone') };
    expect(parts()[0]).toBe('stale');
    expect(parts()).toContain('growth');
  });

  it('shows the empty library and the empty range differently', () => {
    state.query = { data: { ...FULL, items: 0 }, isError: false, error: null };
    state.counts = { library: 0, favourites: 0 };
    expect(parts()).toContain('empty');
    state.counts = { library: 10, favourites: 1 };
    expect(parts()).toContain('range-empty');
  });

  it('shows only counts before two months of history', () => {
    state.query = { data: { ...FULL, growth: null }, isError: false, error: null };
    expect(parts()).toEqual(['range', 'stats', 'young']);
  });

  it('shows every chart and the library folders only to the owner', () => {
    state.query = { data: FULL, isError: false, error: null };
    expect(parts()).toEqual([
      'range',
      'stats',
      'growth',
      'kinds',
      'calendar',
      'week',
      'season',
      'places',
      'cameras',
      'coverage',
      'largest',
      'folders',
    ]);
    state.owner = false;
    expect(parts()).not.toContain('folders');
  });
});
