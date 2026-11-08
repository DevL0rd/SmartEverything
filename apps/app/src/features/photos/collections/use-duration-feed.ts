import { useCallback, useMemo } from 'react';
import type { DriveDurationBucket, TimelineBucket } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { groupMonths, type MediaTile } from '../../../components/media-grid/tiles';
import { flattenPages } from '../../nas/data/pages';
import { usePhotoSearch, type PhotoSearch } from '../data';
import { tilesOfItems } from '../search/results';
import type { FeedState } from '../timeline/timeline-model';
import type { TimelineFeed } from '../timeline/use-timeline-feed';

export type MonthTotal = (month: string, loaded: number) => number | null;

export type CollectionFeed = Pick<
  TimelineFeed,
  'state' | 'tiles' | 'seenAt' | 'sources' | 'failedMore' | 'onEnd' | 'retry'
> & { readonly monthTotal: MonthTotal };

export function durationSearchOf(bucket: DriveDurationBucket): PhotoSearch {
  return { text: null, starred: null, duration: bucket, taken: null, kinds: ['video'] };
}

export function loadedMonthTotal(tiles: readonly MediaTile[], more: boolean): MonthTotal {
  const lastMonth = groupMonths(tiles).at(-1)?.key;
  return (month, loaded) => (more && month === lastMonth ? null : loaded);
}

export function bucketMonthTotal(buckets: readonly TimelineBucket[]): MonthTotal {
  const counts = new Map(buckets.map((bucket) => [bucket.month, bucket.count] as const));
  return (month) => counts.get(month) ?? null;
}

export function durationStateOf(loaded: boolean, failed: boolean, empty: boolean): FeedState {
  if (!loaded) return failed ? 'error' : 'loading';
  return empty ? 'empty' : 'ready';
}

export function useDurationFeed(bucket: DriveDurationBucket): CollectionFeed {
  const query = usePhotoSearch(durationSearchOf(bucket), true);
  const tiles = useMemo(
    () => tilesOfItems(flattenPages(query.data, (page) => page.items)),
    [query.data],
  );
  const { hasNextPage, isFetchingNextPage, fetchNextPage, refetch } = query;
  const onEnd = useCallback((): void => {
    if (hasNextPage && !isFetchingNextPage) {
      background(fetchNextPage(), 'photos.videos.next_page_failed', { bucket });
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, bucket]);
  const retry = useCallback((): void => {
    background(refetch(), 'photos.videos.retry_failed', { bucket });
  }, [refetch, bucket]);
  const loaded = query.data !== undefined;
  const monthTotal = useMemo(() => loadedMonthTotal(tiles, hasNextPage), [tiles, hasNextPage]);
  return {
    state: durationStateOf(loaded, query.isError, tiles.length === 0),
    tiles,
    seenAt: query.dataUpdatedAt === 0 ? null : query.dataUpdatedAt,
    sources: null,
    failedMore: loaded && query.isError,
    onEnd,
    retry,
    monthTotal,
  };
}
