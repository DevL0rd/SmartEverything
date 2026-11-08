import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TimelineBucket } from '@smarteverything/domain';
import type { PhotoScope } from '../../../api/photos';
import type { MediaSelectionControls } from '../../../components/media-grid/selection';
import type { MediaTile } from '../../../components/media-grid/tiles';
import type { PhotosFrameProps } from '../components/photos-frame';
import type { PhotoSearch } from '../data';
import type { TimelineGridProps } from '../timeline/timeline-grid';
import type { CollectionId } from './collection-model';
import type { CollectionFeed } from './use-duration-feed';

type Feed = CollectionFeed & { readonly buckets: readonly TimelineBucket[] };

interface Seen {
  compact: boolean;
  feed: Feed;
  scopes: PhotoScope[];
  searches: PhotoSearch[];
  frame: PhotosFrameProps | null;
  grid: TimelineGridProps | null;
}

const READY: Feed = {
  state: 'ready',
  tiles: [],
  buckets: [],
  seenAt: null,
  sources: null,
  failedMore: false,
  onEnd: () => undefined,
  retry: () => undefined,
  monthTotal: () => null,
};

const HOUR_MS = 3_600_000;

const seen = vi.hoisted((): Seen => ({
  compact: false,
  feed: {
    state: 'ready',
    tiles: [],
    buckets: [],
    seenAt: null,
    sources: null,
    failedMore: false,
    onEnd: () => undefined,
    retry: () => undefined,
    monthTotal: () => null,
  },
  scopes: [],
  searches: [],
  frame: null,
  grid: null,
}));

const INSIGHTS = {
  videoTotals: {
    items: 2318,
    bytes: 1024 ** 3,
    durationMs: 61 * HOUR_MS + 12 * 60_000,
    longestMs: 48 * 60_000 + 10_000,
  },
  durationBuckets: [
    { bucket: 'under_1m', items: 1604, bytes: 1 },
    { bucket: '1_to_10m', items: 652, bytes: 1 },
  ],
  hoursAddedPerMonth: [{ month: '2026-04', hours: 9.4 }],
  kinds: [{ kind: 'screenshot', items: 3940, bytes: 3.4 * 1024 ** 3 }],
} as const;

function stand(name: string): () => ReactNode {
  return function Stand(): ReactNode {
    return createElement('span', {}, name);
  };
}

function spanOf({ label }: { readonly label: string }): ReactNode {
  return createElement('span', {}, label);
}

vi.mock('../../../store/selectors', () => ({
  useSyncStatus: (): { readonly status: string } => ({ status: 'live' }),
}));
vi.mock('../../../store/clock', () => ({ useDayKey: (): string => '2026-11-07' }));
vi.mock('../../../design/size-class', () => ({ useAreaWidth: (): number => 0 }));
vi.mock('../../nas/frame/sections', () => ({
  libraryLayoutOf: (): string => (seen.compact ? 'compact' : 'wide'),
}));
vi.mock('../../nas/frame', () => ({
  ChipRow: ({ children }: { readonly children: ReactNode }): ReactNode =>
    createElement('nav', {}, children),
}));
vi.mock('../../../components/text', () => ({
  Text: ({ children }: { readonly children: ReactNode }): ReactNode =>
    createElement('span', {}, children),
}));
vi.mock('../../../components/icon', () => ({ Icon: (): null => null }));
vi.mock('../../../components/interactive', () => ({
  Interactive: ({ children }: { readonly children: ReactNode }): ReactNode =>
    createElement('a', {}, children),
}));
vi.mock('../../../components/segmented', () => ({ Segmented: stand('zoom') }));
vi.mock('../../../components/button', () => ({ Button: spanOf }));
vi.mock('../../../components/skeleton', () => ({ Skeleton: stand('skeleton') }));
vi.mock('../../../components/charts', () => ({
  Bars: ({ label }: { readonly label: string }): ReactNode => createElement('figure', {}, label),
}));
vi.mock('../../../components/stat-tile', () => ({
  StatTile: ({ label, value }: { readonly label: string; readonly value: string }): ReactNode =>
    createElement('b', {}, `${label}: ${value}`),
}));
vi.mock('../../../components/flat-choice', () => ({
  FlatChoice: ({ label, count }: { readonly label: string; readonly count: number }): ReactNode =>
    createElement('i', {}, `${label} ${String(count)}`),
}));
vi.mock('../../../components/empty-state', () => ({
  EmptyState: ({ title }: { readonly title: string }): ReactNode =>
    createElement('section', {}, title),
}));
vi.mock('../../../components/media-grid/selection', () => ({
  useMediaSelection: (): MediaSelectionControls => ({
    selection: { active: false, ids: new Set(), anchor: null },
    begin: () => undefined,
    clear: () => undefined,
    all: () => undefined,
    press: () => false,
    day: () => undefined,
    dragStart: () => undefined,
    dragOver: () => undefined,
    dragEnd: () => undefined,
  }),
}));
vi.mock('../data', () => ({
  usePhotoRailCounts: (): { readonly data: Record<string, number> } => ({
    data: { favourites: 1204, screenshots: 3940, videos: 2318 },
  }),
  usePhotoInsights: (): { readonly data: unknown } => ({ data: INSIGHTS }),
  usePhotoSearch: (search: PhotoSearch): { readonly data: undefined; readonly isError: false } => {
    seen.searches.push(search);
    return { data: undefined, isError: false };
  },
}));
vi.mock('../timeline/use-timeline-feed', () => ({
  useTimelineFeed: (scope: PhotoScope): Feed => {
    seen.scopes.push(scope);
    return seen.feed;
  },
}));
vi.mock('../timeline/use-media-actions', () => ({ useMediaActions: (): null => null }));
vi.mock('../timeline/timeline-selection', () => ({
  TimelineSelection: stand('selection'),
  TimelineSelectionHead: stand('selection-head'),
  TimelineActionRow: stand('action-row'),
}));
vi.mock('../timeline/timeline-states', () => ({
  OfflineBanner: stand('offline'),
  TimelineError: stand('timeline-error'),
  TimelineLoading: stand('timeline-loading'),
}));
vi.mock('../timeline/timeline-grid', () => ({
  TimelineGrid: (props: TimelineGridProps): ReactNode => {
    seen.grid = props;
    return createElement('div', {}, props.empty);
  },
}));
vi.mock('../components/photos-frame', () => ({
  PhotosFrame: (props: PhotosFrameProps): ReactNode => {
    seen.frame = props;
    return createElement('main', {}, props.children);
  },
}));

const { CollectionScreen } = await import('./collection-screen');
const { olderThanAYear, screenshotLineOf, yearAgoMonth } = await import('./collection-model');
const { bucketMonthTotal, durationSearchOf, durationStateOf, loadedMonthTotal } =
  await import('./use-duration-feed');

function clip(id: string, takenAt: string, durationMs: number): MediaTile {
  return {
    id,
    rev: 1,
    aspect: 16 / 9,
    takenAt: Date.parse(takenAt),
    offsetMin: 0,
    durationMs,
    thumbhash: null,
    flags: 0,
    local: false,
  };
}

const NOVEMBER = [
  clip('a', '2026-11-03T10:00:00Z', 30 * 60_000),
  clip('b', '2026-11-01T10:00:00Z', 11 * 60_000),
];

function render(id: CollectionId): string {
  return renderToStaticMarkup(createElement(CollectionScreen, { id }));
}

describe('Favourites, Videos and Screenshots', () => {
  beforeEach(() => {
    seen.compact = false;
    seen.feed = READY;
    seen.scopes = [];
    seen.searches = [];
    seen.frame = null;
    seen.grid = null;
  });

  it('shows Favourites as the Timeline with the one favourites filter', () => {
    const html = render('favourites');
    expect(seen.scopes).toEqual([{ filter: 'favourites', placeId: null }]);
    expect(seen.frame?.active).toBe('favourites');
    expect(seen.frame?.search).toBe(false);
    expect(seen.frame?.subtitle).toBe('1,204 items');
    expect(html).toContain('Favourite here and Star in Drive are the same mark.');
    expect(seen.grid?.grouping).toBeUndefined();
    expect(html).toContain('Search favourites');
    expect(html).toContain('No favourites yet');
  });

  it('shows Screenshots as the Timeline with the screenshots filter', () => {
    seen.feed = {
      ...READY,
      buckets: [
        { month: '2026-10', count: 60 },
        { month: '2025-11', count: 8 },
        { month: '2025-10', count: 400 },
        { month: '2024-02', count: 12 },
      ],
    };
    const html = render('screenshots');
    expect(seen.scopes).toEqual([{ filter: 'screenshots', placeId: null }]);
    expect(seen.frame?.subtitle).toBe('3,940 screenshots');
    expect(html).toMatch(/3\.4.GB · 412 older than a year/);
  });

  it('counts screenshots older than a year from whole months before the same month last year', () => {
    const buckets = [
      { month: '2025-12', count: 5 },
      { month: '2025-01', count: 7 },
    ] as const;
    expect(yearAgoMonth('2026-01-15')).toBe('2025-01');
    expect(olderThanAYear(buckets, '2026-01-15')).toBe(0);
    expect(olderThanAYear(buckets, '2026-12-01')).toBe(7);
    expect(screenshotLineOf(undefined, buckets, '2026-12-01')).toBeNull();
  });

  it('shows Videos with stat tiles, hours per month and length chips with counts', () => {
    const html = render('videos');
    expect(seen.scopes).toEqual([{ filter: 'videos', placeId: null }]);
    expect(seen.frame?.subtitle).toMatch(/^2,318 videos · 61 h 12 min · /);
    expect(html).toContain('Videos: 2,318');
    expect(html).toContain('Total time: 61 h 12 min');
    expect(html).toContain('Longest: 48:10');
    expect(html).toContain('Hours added per month');
    expect(html).toContain('Peak April, 9.4 h');
    expect(html).toContain('Any length 2318');
    expect(html).toContain('Under 1 min 1604');
  });

  it('drops the toolbar on the phone and keeps search and Select in the header', () => {
    seen.compact = true;
    const html = render('videos');
    expect(html).not.toContain('Search videos');
    expect(html).not.toContain('Videos: 2,318');
    expect(seen.frame?.actions?.map((action) => action.label)).toEqual(['Search photos', 'Select']);
    expect(seen.frame?.search).toBe(false);
  });

  it('shows the loading and error states of the feed', () => {
    seen.feed = { ...READY, state: 'loading' };
    expect(render('favourites')).toContain('timeline-loading');
    seen.feed = { ...READY, state: 'error' };
    expect(render('favourites')).toContain('timeline-error');
  });

  it('filters a length bucket through the video search', () => {
    expect(durationSearchOf('1_to_10m')).toEqual({
      text: null,
      starred: null,
      duration: '1_to_10m',
      taken: null,
      kinds: ['video'],
    });
    expect(durationStateOf(false, false, true)).toBe('loading');
    expect(durationStateOf(false, true, true)).toBe('error');
    expect(durationStateOf(true, false, true)).toBe('empty');
    expect(durationStateOf(true, true, false)).toBe('ready');
  });

  it('heads Videos by month with the month count and, once loaded, its total length', () => {
    seen.feed = {
      ...READY,
      tiles: NOVEMBER,
      buckets: [{ month: '2026-11', count: 2 }],
    };
    render('videos');
    expect(seen.grid?.grouping).toBe('month');
    const head = seen.grid?.headText;
    expect(head?.({ key: '2026-11', tiles: NOVEMBER })).toEqual({
      title: 'November 2026',
      detail: '2 videos · 41 min',
    });
    expect(head?.({ key: '2026-11', tiles: NOVEMBER.slice(0, 1) })).toEqual({
      title: 'November 2026',
      detail: '2 videos',
    });
  });

  it('counts a month from the buckets, or from loaded results once no page is left in it', () => {
    expect(bucketMonthTotal([{ month: '2026-11', count: 24 }])('2026-11', 3)).toBe(24);
    expect(bucketMonthTotal([])('2026-11', 3)).toBeNull();
    const more = loadedMonthTotal([...NOVEMBER, clip('c', '2026-10-30T10:00:00Z', 60_000)], true);
    expect(more('2026-11', 2)).toBe(2);
    expect(more('2026-10', 1)).toBeNull();
    expect(loadedMonthTotal(NOVEMBER, false)('2026-11', 2)).toBe(2);
  });
});
