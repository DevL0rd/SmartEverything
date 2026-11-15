import type { LibraryBucket } from '@smarteverything/domain';
import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react';
import { background } from '@smarteverything/logging';
import type { LibraryScope } from '@smarteverything/domain';
import type { MonthFocus } from '../../../components/media-grid/media-grid';
import { tilesOfPage, type MediaTile } from '../../../components/media-grid/tiles';
import { flattenPages } from '../../drive';
import { usePhotoBuckets, usePhotoMonth } from '../data';
import { useLocalMerge } from './phone-merge';
import { endStep, feedState, feedTiles, type FeedState, type MonthFeed } from './library-model';

interface Pager {
  readonly more: () => void;
  readonly retry: () => void;
}

interface SourceProps {
  readonly month: string;
  readonly scope: LibraryScope;
  readonly all: boolean;
  readonly onFeed: (month: string, feed: MonthFeed, pager: Pager) => void;
}

function MonthSource({ month, scope, all, onFeed }: SourceProps): ReactNode {
  const pages = usePhotoMonth(month, scope, true);
  const tiles = useMemo(() => flattenPages(pages.data, tilesOfPage), [pages.data]);
  const report = useEffectEvent(onFeed);
  const { hasNextPage, isFetching, isError, fetchNextPage, refetch } = pages;
  useEffect(() => {
    if (!all || !hasNextPage || isFetching || isError) return;
    background(fetchNextPage(), 'photos.library.page_failed', { month });
  }, [all, month, hasNextPage, isFetching, isError, fetchNextPage]);
  useEffect(() => {
    report(
      month,
      { tiles, more: hasNextPage, loading: isFetching, failed: isError },
      {
        more: (): void => {
          background(fetchNextPage(), 'photos.library.page_failed', { month });
        },
        retry: (): void => {
          background(refetch(), 'photos.library.retry_failed', { month });
        },
      },
    );
  }, [month, tiles, hasNextPage, isFetching, isError, fetchNextPage, refetch]);
  return null;
}

export interface LibraryFeed {
  readonly state: FeedState;
  readonly buckets: readonly LibraryBucket[];
  readonly tiles: readonly MediaTile[];
  readonly seenAt: number | null;
  readonly sources: ReactNode;
  readonly loadingMore: boolean;
  readonly failedMore: boolean;
  readonly complete: boolean;
  readonly onEnd: () => void;
  readonly retry: () => void;
  readonly loadAll: () => void;
  readonly focus: MonthFocus | null;
}

const NO_BUCKETS: readonly LibraryBucket[] = [];

interface ScopedFeeds {
  readonly key: string;
  readonly feeds: ReadonlyMap<string, MonthFeed>;
  readonly shown: number;
  readonly all: boolean;
}

const NO_FEEDS: ReadonlyMap<string, MonthFeed> = new Map();

function freshFeeds(key: string): ScopedFeeds {
  return { key, feeds: NO_FEEDS, shown: 1, all: false };
}

function useFeeds(key: string): {
  readonly feeds: ReadonlyMap<string, MonthFeed>;
  readonly shownCount: number;
  readonly all: boolean;
  readonly showMore: (count: number) => void;
  readonly showAll: () => void;
  readonly pagerOf: (month: string | undefined) => Pager | undefined;
  readonly onFeed: (key: string) => SourceProps['onFeed'];
} {
  const [held, setHeld] = useState<ScopedFeeds>(() => freshFeeds(key));
  const pagers = useRef(new Map<string, Pager>());
  const current = held.key === key ? held : freshFeeds(key);
  return {
    feeds: current.feeds,
    shownCount: current.shown,
    all: current.all,
    showMore: (count): void => {
      setHeld((state) => (state.key === key ? { ...state, shown: count } : state));
    },
    showAll: (): void => {
      setHeld((state) => ({ ...(state.key === key ? state : freshFeeds(key)), all: true }));
    },
    pagerOf: (month) => (month === undefined ? undefined : pagers.current.get(`${key}|${month}`)),
    onFeed:
      (source) =>
      (month, feed, pager): void => {
        pagers.current.set(`${source}|${month}`, pager);
        setHeld((state) => {
          const base = state.key === source ? state : freshFeeds(source);
          return { ...base, feeds: new Map(base.feeds).set(month, feed) };
        });
      },
  };
}

function retryFeed(
  query: ReturnType<typeof usePhotoBuckets>,
  shown: readonly string[],
  feeds: ReadonlyMap<string, MonthFeed>,
  pagerOf: (month: string | undefined) => Pager | undefined,
): void {
  if (query.isError) {
    background(query.refetch(), 'photos.library.retry_failed');
    return;
  }
  for (const month of shown) {
    if (feeds.get(month)?.failed === true) pagerOf(month)?.retry();
  }
}

export function feedsComplete(
  buckets: readonly LibraryBucket[],
  shown: readonly string[],
  feeds: ReadonlyMap<string, MonthFeed>,
): boolean {
  if (shown.length < buckets.length) return false;
  return shown.every((month) => {
    const feed = feeds.get(month);
    return feed !== undefined && !feed.more && !feed.loading;
  });
}

export function scopeKeyOf(scope: LibraryScope): string {
  return JSON.stringify(scope);
}

export function monthsReady(
  shown: readonly string[],
  target: number,
  feeds: ReadonlyMap<string, MonthFeed>,
): boolean {
  return shown.slice(0, target + 1).every((month, index) => {
    const feed = feeds.get(month);
    if (feed === undefined || feed.loading) return false;
    return index === target || !feed.more;
  });
}

export interface FeedFocus {
  readonly month: string;
  readonly onReached: () => void;
}

export function useLibraryFeed(scope: LibraryScope): LibraryFeed {
  return useFocusedLibraryFeed(scope, null);
}

function targetOf(buckets: readonly LibraryBucket[], wanted: FeedFocus | null): number {
  if (wanted === null) return -1;
  return buckets.findIndex((bucket) => bucket.month === wanted.month);
}

interface FocusInput {
  readonly wanted: FeedFocus | null;
  readonly target: number;
  readonly shown: readonly string[];
  readonly feeds: ReadonlyMap<string, MonthFeed>;
  readonly settle: () => void;
}

function focusOf({ wanted, target, shown, feeds, settle }: FocusInput): MonthFocus | null {
  if (wanted === null || target < 0 || !monthsReady(shown, target, feeds)) return null;
  return {
    month: wanted.month,
    onFocused: (): void => {
      settle();
      wanted.onReached();
    },
  };
}

function stateOf(
  tiles: readonly MediaTile[],
  query: ReturnType<typeof usePhotoBuckets>,
  first: MonthFeed | undefined,
): FeedState {
  if (tiles.length > 0) return 'ready';
  return feedState({ buckets: query.data, bucketsFailed: query.isError, first });
}

export function useFocusedLibraryFeed(scope: LibraryScope, wanted: FeedFocus | null): LibraryFeed {
  const query = usePhotoBuckets(scope);
  const buckets = query.data ?? NO_BUCKETS;
  const key = scopeKeyOf(scope);
  const { feeds, shownCount, all, showMore, showAll, pagerOf, onFeed } = useFeeds(key);
  const target = targetOf(buckets, wanted);
  const count = Math.max(shownCount, target + 1);
  const shown = useMemo(
    () => (all ? buckets : buckets.slice(0, count)).map((bucket) => bucket.month),
    [buckets, count, all],
  );
  const settle = (): void => {
    showMore(count);
  };
  const hubTiles = useMemo(() => feedTiles(shown, feeds), [shown, feeds]);
  const last = feeds.get(shown.at(-1) ?? '');
  const tiles = useLocalMerge(hubTiles, scope);
  return {
    state: stateOf(tiles, query, feeds.get(shown[0] ?? '')),
    buckets,
    tiles,
    seenAt: query.dataUpdatedAt === 0 ? null : query.dataUpdatedAt,
    sources: shown.map((month, index) => (
      <MonthSource
        key={`${key}|${month}`}
        month={month}
        scope={scope}
        all={all || index < target}
        onFeed={onFeed(key)}
      />
    )),
    loadingMore: last?.loading === true,
    failedMore: query.isError || last?.failed === true,
    complete: query.data !== undefined && feedsComplete(buckets, shown, feeds),
    loadAll: showAll,
    focus: focusOf({ wanted, target, shown, feeds, settle }),
    onEnd: (): void => {
      const step = endStep(shown, feeds, buckets.length);
      if (step === 'next') showMore(shown.length + 1);
      if (step === 'fetch') pagerOf(shown.at(-1))?.more();
    },
    retry: (): void => {
      retryFeed(query, shown, feeds, pagerOf);
    },
  };
}
