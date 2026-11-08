import { useEffect } from 'react';
import type { DriveRecentEntry, DriveRecentFilter } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useMinute } from '../../../store/clock';
import { useSettings } from '../../../store/selectors';
import { flattenPages, useDriveRecent } from '../../nas/data';
import {
  linesOf,
  recentDaysOf,
  weekCovered,
  type RecentDays,
  type RecentLine,
} from './recent-model';

export type RecentPages = ReturnType<typeof useDriveRecent>;

export interface RecentFeed {
  readonly pages: RecentPages;
  readonly lines: readonly RecentLine[];
  readonly days: RecentDays;
}

export function loadMore(pages: RecentPages): void {
  if (pages.hasNextPage && !pages.isFetchingNextPage && !pages.isError) {
    background(pages.fetchNextPage(), 'drive_recent.next_page_failed');
  }
}

function useWeekLoaded(
  pages: RecentPages,
  entries: readonly DriveRecentEntry[],
  days: RecentDays,
): void {
  const pending = pages.hasNextPage && !weekCovered(entries, days);
  useEffect(() => {
    if (pending) loadMore(pages);
  }, [pending, pages]);
}

export function useRecentFeed(filter: DriveRecentFilter): RecentFeed {
  const pages = useDriveRecent(filter);
  const zone = useSettings().time_zone;
  const days = recentDaysOf(useMinute(), zone);
  const entries = flattenPages(pages.data, (page) => page.entries);
  useWeekLoaded(pages, entries, days);
  return { pages, lines: linesOf(entries, days), days };
}
