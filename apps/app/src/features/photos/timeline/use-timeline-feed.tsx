import type { TimelineBucket } from '@smarteverything/domain';
import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react';
import { background } from '@smarteverything/logging';
import type { PhotoScope } from '../../../api/photos';
import { tilesOfPage, type MediaTile } from '../../../components/media-grid/tiles';
import { flattenPages } from '../../nas/data/pages';
import { usePhotoBuckets, usePhotoMonth } from '../data';
import { useLocalMerge } from './phone-merge';
import { endStep, feedState, feedTiles, type FeedState, type MonthFeed } from './timeline-model';

interface Pager {
  readonly more: () => void;
  readonly retry: () => void;
}

interface SourceProps {
  readonly month: string;
  readonly scope: PhotoScope;
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
          background(fetchNextPage(), 'photos.timeline.page_failed', { month });
        },
        retry: (): void => {
          background(refetch(), 'photos.timeline.retry_failed', { month });
        },
      },
    );
  }, [month, tiles, hasNextPage, isFetching, isError, fetchNextPage, refetch]);
  return null;
}

export interface TimelineFeed {
  readonly state: FeedState;
  readonly buckets: readonly TimelineBucket[];
  readonly tiles: readonly MediaTile[];
  readonly seenAt: number | null;
  readonly sources: ReactNode;
  readonly loadingMore: boolean;
  readonly failedMore: boolean;
  readonly onEnd: () => void;
  readonly retry: () => void;
}

const NO_BUCKETS: readonly TimelineBucket[] = [];

function useFeeds(): {
  readonly feeds: ReadonlyMap<string, MonthFeed>;
  readonly pagerOf: (month: string | undefined) => Pager | undefined;
  readonly onFeed: SourceProps['onFeed'];
} {
  const [feeds, setFeeds] = useState<ReadonlyMap<string, MonthFeed>>(new Map());
  const pagers = useRef(new Map<string, Pager>());
  return {
    feeds,
    pagerOf: (month) => (month === undefined ? undefined : pagers.current.get(month)),
    onFeed: (month, feed, pager): void => {
      pagers.current.set(month, pager);
      setFeeds((current) => new Map(current).set(month, feed));
    },
  };
}

export function useTimelineFeed(scope: PhotoScope): TimelineFeed {
  const query = usePhotoBuckets(scope);
  const buckets = query.data ?? NO_BUCKETS;
  const [shownCount, setShownCount] = useState(1);
  const { feeds, pagerOf, onFeed } = useFeeds();
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
      <MonthSource key={month} month={month} scope={scope} onFeed={onFeed} />
    )),
    loadingMore: last?.loading === true,
    failedMore: query.isError || last?.failed === true,
    onEnd: (): void => {
      const step = endStep(shown, feeds, buckets.length);
      if (step === 'next') setShownCount(shown.length + 1);
      if (step === 'fetch') pagerOf(shown.at(-1))?.more();
    },
    retry: (): void => {
      if (query.isError) {
        background(query.refetch(), 'photos.timeline.retry_failed');
        return;
      }
      for (const month of shown) {
        if (feeds.get(month)?.failed === true) pagerOf(month)?.retry();
      }
    },
  };
}
