import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { LibraryBucket, LibraryPage } from '@smarteverything/domain';
import { DRIVE_PREFIX } from '../../../queries/keys';

type Pages = InfiniteData<LibraryPage, string | null>;

interface MonthWindow {
  readonly group: string;
  readonly month: string;
}

function isDriveWindow(key: readonly unknown[]): boolean {
  return key[0] === DRIVE_PREFIX[0] && key[1] === DRIVE_PREFIX[1];
}

function monthWindowOf(key: readonly unknown[]): MonthWindow | null {
  if (!isDriveWindow(key)) return null;
  const [, , kind, , fourth, fifth, sixth] = key;
  if ((kind === 'photo-month' || kind === 'photo-archive-month') && typeof fourth === 'string')
    return { group: JSON.stringify([kind, fifth]), month: fourth };
  if (kind === 'photo-locked' && fifth === 'month' && typeof sixth === 'string')
    return { group: JSON.stringify([kind, fourth]), month: sixth };
  return null;
}

function bucketGroupOf(key: readonly unknown[]): string | null {
  if (!isDriveWindow(key)) return null;
  const [, , kind, , fourth, fifth] = key;
  if (kind === 'photo-buckets') return JSON.stringify(['photo-month', fourth]);
  if (kind === 'photo-archive-buckets') return JSON.stringify(['photo-archive-month', fourth]);
  if (kind === 'photo-locked' && fifth === 'buckets') return JSON.stringify([kind, fourth]);
  return null;
}

export function pageWithout(page: LibraryPage, gone: ReadonlySet<string>): LibraryPage {
  if (!page.ids.some((id) => gone.has(id))) return page;
  const kept = (_value: unknown, index: number): boolean => {
    const id = page.ids[index];
    return id !== undefined && !gone.has(id);
  };
  return {
    ...page,
    ids: page.ids.filter(kept),
    revs: page.revs.filter(kept),
    aspect: page.aspect.filter(kept),
    takenAt: page.takenAt.filter(kept),
    offsetMin: page.offsetMin.filter(kept),
    durationMs: page.durationMs.filter(kept),
    flags: page.flags.filter(kept),
  };
}

function countGone(pages: Pages, gone: ReadonlySet<string>): number {
  return pages.pages.reduce((sum, page) => sum + page.ids.filter((id) => gone.has(id)).length, 0);
}

function dropFromMonths(
  client: QueryClient,
  gone: ReadonlySet<string>,
): ReadonlyMap<string, ReadonlyMap<string, number>> {
  const removed = new Map<string, Map<string, number>>();
  const months = client.getQueriesData<Pages>({
    queryKey: DRIVE_PREFIX,
    predicate: (query) => monthWindowOf(query.queryKey) !== null,
  });
  for (const [key, data] of months) {
    const window = monthWindowOf(key);
    if (window === null || data === undefined) continue;
    const count = countGone(data, gone);
    if (count === 0) continue;
    client.setQueryData<Pages>(key, {
      ...data,
      pages: data.pages.map((page) => pageWithout(page, gone)),
    });
    const group = removed.get(window.group) ?? new Map<string, number>();
    group.set(window.month, (group.get(window.month) ?? 0) + count);
    removed.set(window.group, group);
  }
  return removed;
}

export function bucketsWithout(
  buckets: readonly LibraryBucket[],
  removed: ReadonlyMap<string, number>,
): readonly LibraryBucket[] {
  return buckets.flatMap((bucket) => {
    const count = bucket.count - (removed.get(bucket.month) ?? 0);
    if (count === bucket.count) return [bucket];
    return count > 0 ? [{ ...bucket, count }] : [];
  });
}

function dropFromBuckets(
  client: QueryClient,
  removed: ReadonlyMap<string, ReadonlyMap<string, number>>,
): void {
  if (removed.size === 0) return;
  const buckets = client.getQueriesData<readonly LibraryBucket[]>({
    queryKey: DRIVE_PREFIX,
    predicate: (query) => bucketGroupOf(query.queryKey) !== null,
  });
  for (const [key, data] of buckets) {
    const group = bucketGroupOf(key);
    const months = group === null ? undefined : removed.get(group);
    if (months === undefined || data === undefined) continue;
    client.setQueryData<readonly LibraryBucket[]>(key, bucketsWithout(data, months));
  }
}

export function dropPhotoItems(client: QueryClient, itemIds: readonly string[]): void {
  if (itemIds.length === 0) return;
  const gone = new Set(itemIds);
  dropFromBuckets(client, dropFromMonths(client, gone));
}
