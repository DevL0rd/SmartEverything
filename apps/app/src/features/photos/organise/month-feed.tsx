import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react';
import type { LibraryBucket } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { tilesOfPage, type MediaTile } from '../../../components/media-grid/tiles';
import { flattenPages } from '../../drive';
import {
  endStep,
  feedState,
  feedTiles,
  type FeedState,
  type MonthFeed,
} from '../library/library-model';
import { sourceKeyOf, useSourceBuckets, useSourceMonth, type MonthSource } from './queries';

interface Pager {
  readonly more: () => void;
  readonly retry: () => void;
}

type OnFeed = (month: string, feed: MonthFeed, pager: Pager) => void;

function MonthReader({
  source,
  month,
  onFeed,
}: {
  readonly source: MonthSource;
  readonly month: string;
  readonly onFeed: OnFeed;
}): ReactNode {
  const pages = useSourceMonth(source, month);
  const tiles = useMemo(() => flattenPages(pages.data, tilesOfPage), [pages.data]);
  const report = useEffectEvent(onFeed);
  const { hasNextPage, isFetching, isError, fetchNextPage, refetch } = pages;
  useEffect(() => {
    report(
      month,
      { tiles, more: hasNextPage, loading: isFetching, failed: isError },
      {
        more: (): void => {
          background(fetchNextPage(), 'photos.organise.page_failed', { month });
        },
        retry: (): void => {
          background(refetch(), 'photos.organise.retry_failed', { month });
        },
      },
    );
  }, [month, tiles, hasNextPage, isFetching, isError, fetchNextPage, refetch]);
  return null;
}

export interface OrganiseFeed {
  readonly state: FeedState;
  readonly buckets: readonly LibraryBucket[];
  readonly tiles: readonly MediaTile[];
  readonly total: number;
  readonly failed: unknown;
  readonly sources: ReactNode;
  readonly onEnd: () => void;
  readonly retry: () => void;
}

const NO_BUCKETS: readonly LibraryBucket[] = [];

interface Held {
  readonly key: string;
  readonly feeds: ReadonlyMap<string, MonthFeed>;
  readonly shown: number;
}

function freshFor(key: string): Held {
  return { key, feeds: new Map(), shown: 1 };
}

interface HeldFeeds {
  readonly current: Held;
  readonly onFeed: OnFeed;
  readonly pagerOf: (month: string | undefined) => Pager | undefined;
  readonly showMore: (count: number) => void;
}

function useHeldFeeds(key: string): HeldFeeds {
  const [held, setHeld] = useState<Held>(() => freshFor(key));
  const pagers = useRef(new Map<string, Pager>());
  const baseOf = (state: Held): Held => (state.key === key ? state : freshFor(key));
  return {
    current: baseOf(held),
    onFeed: (month, feed, pager): void => {
      pagers.current.set(`${key}|${month}`, pager);
      setHeld((state) => {
        const base = baseOf(state);
        return { ...base, feeds: new Map(base.feeds).set(month, feed) };
      });
    },
    pagerOf: (month) => (month === undefined ? undefined : pagers.current.get(`${key}|${month}`)),
    showMore: (count): void => {
      setHeld((state) => ({ ...baseOf(state), shown: count }));
    },
  };
}

export function useMonthFeed(source: MonthSource): OrganiseFeed {
  const key = sourceKeyOf(source);
  const query = useSourceBuckets(source);
  const buckets = query.data ?? NO_BUCKETS;
  const { current, onFeed, pagerOf, showMore } = useHeldFeeds(key);
  const shown = useMemo(
    () => buckets.slice(0, current.shown).map((bucket) => bucket.month),
    [buckets, current.shown],
  );
  const tiles = useMemo(() => feedTiles(shown, current.feeds), [shown, current.feeds]);
  const first = shown[0];
  return {
    state:
      tiles.length > 0
        ? 'ready'
        : feedState({
            buckets: query.data,
            bucketsFailed: query.isError,
            first: first === undefined ? undefined : current.feeds.get(first),
          }),
    buckets,
    tiles,
    total: buckets.reduce((sum, bucket) => sum + bucket.count, 0),
    failed: query.error,
    sources: shown.map((month) => (
      <MonthReader key={`${key}|${month}`} source={source} month={month} onFeed={onFeed} />
    )),
    onEnd: (): void => {
      const step = endStep(shown, current.feeds, buckets.length);
      if (step === 'next') showMore(shown.length + 1);
      if (step === 'fetch') pagerOf(shown.at(-1))?.more();
    },
    retry: (): void => {
      if (query.isError) {
        background(query.refetch(), 'photos.organise.retry_failed');
        return;
      }
      for (const month of shown) {
        if (current.feeds.get(month)?.failed === true) pagerOf(month)?.retry();
      }
    },
  };
}
