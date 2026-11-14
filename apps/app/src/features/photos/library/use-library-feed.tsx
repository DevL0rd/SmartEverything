import type { LibraryBucket } from '@smarteverything/domain';
import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react';
import { background } from '@smarteverything/logging';
import type { LibraryScope } from '@smarteverything/domain';
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
  readonly onFeed: (month: string, feed: MonthFeed, pager: Pager) => void;
}

function MonthSource({ month, scope, onFeed }: SourceProps): ReactNode {
  const pages = usePhotoMonth(month, scope, true);
  const tiles = useMemo(() => flattenPages(pages.data, tilesOfPage), [pages.data]);
  const report = useEffectEvent(onFeed);
  const { hasNextPage, isFetching, isError, fetchNextPage, refetch } = pages;
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
  readonly onEnd: () => void;
  readonly retry: () => void;
}

const NO_BUCKETS: readonly LibraryBucket[] = [];

interface ScopedFeeds {
  readonly key: string;
  readonly feeds: ReadonlyMap<string, MonthFeed>;
  readonly shown: number;
}

const NO_FEEDS: ReadonlyMap<string, MonthFeed> = new Map();

function useFeeds(key: string): {
  readonly feeds: ReadonlyMap<string, MonthFeed>;
  readonly shownCount: number;
  readonly showMore: (count: number) => void;
  readonly pagerOf: (month: string | undefined) => Pager | undefined;
  readonly onFeed: (key: string) => SourceProps['onFeed'];
} {
  const [held, setHeld] = useState<ScopedFeeds>({ key, feeds: NO_FEEDS, shown: 1 });
  const pagers = useRef(new Map<string, Pager>());
  const current = held.key === key ? held : { key, feeds: NO_FEEDS, shown: 1 };
  return {
    feeds: current.feeds,
    shownCount: current.shown,
    showMore: (count): void => {
      setHeld((state) => (state.key === key ? { ...state, shown: count } : state));
    },
    pagerOf: (month) => (month === undefined ? undefined : pagers.current.get(`${key}|${month}`)),
    onFeed:
      (source) =>
      (month, feed, pager): void => {
        pagers.current.set(`${source}|${month}`, pager);
        setHeld((state) => {
          const base = state.key === source ? state : { key: source, feeds: NO_FEEDS, shown: 1 };
          return { ...base, feeds: new Map(base.feeds).set(month, feed) };
        });
      },
  };
}

export function scopeKeyOf(scope: LibraryScope): string {
  return JSON.stringify(scope);
}

export function useLibraryFeed(scope: LibraryScope): LibraryFeed {
  const query = usePhotoBuckets(scope);
  const buckets = query.data ?? NO_BUCKETS;
  const key = scopeKeyOf(scope);
  const { feeds, shownCount, showMore, pagerOf, onFeed } = useFeeds(key);
  const shown = useMemo(
    () => buckets.slice(0, shownCount).map((bucket) => bucket.month),
    [buckets, shownCount],
  );
  const hubTiles = useMemo(() => feedTiles(shown, feeds), [shown, feeds]);
  const last = feeds.get(shown.at(-1) ?? '');
  const tiles = useLocalMerge(hubTiles, scope);
  const firstMonth = shown[0];
  return {
    state:
      tiles.length > 0
        ? 'ready'
        : feedState({
            buckets: query.data,
            bucketsFailed: query.isError,
            first: firstMonth === undefined ? undefined : feeds.get(firstMonth),
          }),
    buckets,
    tiles,
    seenAt: query.dataUpdatedAt === 0 ? null : query.dataUpdatedAt,
    sources: shown.map((month) => (
      <MonthSource key={`${key}|${month}`} month={month} scope={scope} onFeed={onFeed(key)} />
    )),
    loadingMore: last?.loading === true,
    failedMore: query.isError || last?.failed === true,
    onEnd: (): void => {
      const step = endStep(shown, feeds, buckets.length);
      if (step === 'next') showMore(shown.length + 1);
      if (step === 'fetch') pagerOf(shown.at(-1))?.more();
    },
    retry: (): void => {
      if (query.isError) {
        background(query.refetch(), 'photos.library.retry_failed');
        return;
      }
      for (const month of shown) {
        if (feeds.get(month)?.failed === true) pagerOf(month)?.retry();
      }
    },
  };
}
