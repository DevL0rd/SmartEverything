import { QueryClient, type InfiniteData } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import type { LibraryBucket, LibraryPage, LibraryScope } from '@smarteverything/domain';
import { dropPhotoItems, pageWithout } from './drop-items';
import { PHOTO_ALL, photoKeys } from './keys';

const A = '00000000-0000-4000-8000-0000000000a1';
const B = '00000000-0000-4000-8000-0000000000b1';
const C = '00000000-0000-4000-8000-0000000000c1';
const D = '00000000-0000-4000-8000-0000000000d1';

const SEARCH: LibraryScope = { filter: 'all', meaning: 'bank slip' };

function page(month: string, ids: readonly string[], next: string | null = null): LibraryPage {
  return {
    month,
    ids,
    revs: ids.map((_, index) => index + 1),
    aspect: ids.map(() => 1),
    takenAt: ids.map((_, index) => index * 1000),
    offsetMin: ids.map(() => null),
    durationMs: ids.map(() => null),
    flags: ids.map(() => 0),
    next,
  };
}

function pages(...list: readonly LibraryPage[]): InfiniteData<LibraryPage, string | null> {
  return {
    pages: [...list],
    pageParams: list.map((_, index) => (index === 0 ? null : `c${String(index)}`)),
  };
}

function idsOf(client: QueryClient, key: readonly unknown[]): readonly string[] {
  const data = client.getQueryData<InfiniteData<LibraryPage, string | null>>(key);
  return data === undefined ? [] : data.pages.flatMap((entry) => entry.ids);
}

function seeded(): QueryClient {
  const client = new QueryClient();
  client.setQueryData(
    photoKeys.month('2026-11', PHOTO_ALL),
    pages(page('2026-11', [A, B], 'c1'), page('2026-11', [C])),
  );
  client.setQueryData(photoKeys.month('2026-10', PHOTO_ALL), pages(page('2026-10', [D])));
  client.setQueryData(photoKeys.month('2026-11', SEARCH), pages(page('2026-11', [A, C])));
  client.setQueryData<readonly LibraryBucket[]>(photoKeys.buckets(PHOTO_ALL), [
    { month: '2026-11', count: 3 },
    { month: '2026-10', count: 1 },
  ]);
  client.setQueryData<readonly LibraryBucket[]>(photoKeys.buckets(SEARCH), [
    { month: '2026-11', count: 2 },
  ]);
  client.setQueryData(photoKeys.archiveMonth('2026-11', PHOTO_ALL), pages(page('2026-11', [B])));
  client.setQueryData(photoKeys.lockedMonth('token', '2026-11'), pages(page('2026-11', [C])));
  client.setQueryData<readonly LibraryBucket[]>(photoKeys.lockedBuckets('token'), [
    { month: '2026-11', count: 1 },
  ]);
  return client;
}

describe('dropping deleted photos from the cached views', () => {
  it('keeps every column of a page aligned with its ids', () => {
    expect(pageWithout(page('2026-11', [A, B, C]), new Set([B]))).toEqual({
      ...page('2026-11', [A, C]),
      revs: [1, 3],
      takenAt: [0, 2000],
    });
  });

  it('removes the items from the library, search, archive and locked months at once', () => {
    const client = seeded();
    dropPhotoItems(client, [A, C]);
    expect(idsOf(client, photoKeys.month('2026-11', PHOTO_ALL))).toEqual([B]);
    expect(idsOf(client, photoKeys.month('2026-10', PHOTO_ALL))).toEqual([D]);
    expect(idsOf(client, photoKeys.month('2026-11', SEARCH))).toEqual([]);
    expect(idsOf(client, photoKeys.archiveMonth('2026-11', PHOTO_ALL))).toEqual([B]);
    expect(idsOf(client, photoKeys.lockedMonth('token', '2026-11'))).toEqual([]);
  });

  it('lowers the month counts of the same view and drops emptied months', () => {
    const client = seeded();
    dropPhotoItems(client, [A, C]);
    expect(client.getQueryData(photoKeys.buckets(PHOTO_ALL))).toEqual([
      { month: '2026-11', count: 1 },
      { month: '2026-10', count: 1 },
    ]);
    expect(client.getQueryData(photoKeys.buckets(SEARCH))).toEqual([]);
    expect(client.getQueryData(photoKeys.lockedBuckets('token'))).toEqual([]);
  });

  it('leaves views that held none of the items untouched', () => {
    const client = seeded();
    const before = client.getQueryData(photoKeys.month('2026-10', PHOTO_ALL));
    dropPhotoItems(client, [A]);
    expect(client.getQueryData(photoKeys.month('2026-10', PHOTO_ALL))).toBe(before);
    expect(client.getQueryData(photoKeys.lockedBuckets('token'))).toEqual([
      { month: '2026-11', count: 1 },
    ]);
  });
});
