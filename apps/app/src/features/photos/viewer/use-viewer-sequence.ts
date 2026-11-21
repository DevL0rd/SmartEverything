import { useEffect, useMemo } from 'react';
import { keepPreviousData, type UseQueryResult } from '@tanstack/react-query';
import { background } from '@smarteverything/logging';
import type { LibraryBucket, LibraryPage, LibraryScope } from '@smarteverything/domain';
import { readLibraryBuckets, readLibraryPage } from '../../../api/photos';
import { tilesOfPage } from '../../../components/media-grid/tiles';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { flattenPages, useDrivePages, type DrivePages } from '../../drive';
import { photoKeys } from '../data/keys';
import { useFolderScope } from '../folders/data';
import { readArchiveBuckets, readArchivePage } from '../organise/api';
import type { ViewerFrom } from './params';
import {
  adjacentMonths,
  EMPTY_SEQUENCE,
  needsMore,
  sequenceOf,
  type MonthTiles,
  type ViewerSequence,
} from './sequence';

const NO_MONTH = '0000-01';

interface MonthRead {
  readonly tiles: MonthTiles | null;
  readonly more: () => void;
}

function useSequenceBuckets(
  requested: LibraryScope,
  from: ViewerFrom,
): UseQueryResult<readonly LibraryBucket[]> {
  const scope = useFolderScope(requested);
  const archive = from === 'archive';
  return useScreenQuery({
    queryKey: archive ? photoKeys.archiveBuckets(scope) : photoKeys.buckets(scope),
    queryFn: ({ signal }) =>
      archive ? readArchiveBuckets(scope, signal) : readLibraryBuckets(scope, signal),
    placeholderData: keepPreviousData,
    retry: false,
  });
}

function useSequenceMonth(
  month: string,
  requested: LibraryScope,
  from: ViewerFrom,
  enabled: boolean,
): DrivePages<LibraryPage> {
  const scope = useFolderScope(requested);
  const archive = from === 'archive';
  return useDrivePages({
    queryKey: archive ? photoKeys.archiveMonth(month, scope) : photoKeys.month(month, scope),
    read: (cursor, signal) =>
      archive
        ? readArchivePage(month, scope, cursor, signal)
        : readLibraryPage(month, scope, cursor, signal),
    enabled,
  });
}

interface SequenceSource {
  readonly scope: LibraryScope;
  readonly from: ViewerFrom;
}

function useMonthTiles(month: string | null, source: SequenceSource, enabled: boolean): MonthRead {
  const pages = useSequenceMonth(
    month ?? NO_MONTH,
    source.scope,
    source.from,
    enabled && month !== null,
  );
  const { data, hasNextPage, isFetchingNextPage, fetchNextPage } = pages;
  const tiles = useMemo(() => flattenPages(data, tilesOfPage), [data]);
  return {
    tiles: month === null || data === undefined ? null : { month, tiles, complete: !hasNextPage },
    more: (): void => {
      if (hasNextPage && !isFetchingNextPage) {
        background(fetchNextPage(), 'photos.viewer.page_failed');
      }
    },
  };
}

function useReadUntil(read: MonthRead, wanted: boolean): void {
  const { tiles, more } = read;
  const pending = wanted && tiles !== null && !tiles.complete;
  const loaded = tiles?.tiles.length ?? 0;
  useEffect(() => {
    if (pending) more();
  }, [pending, loaded, more]);
}

export function useViewerSequence(
  itemId: string,
  month: string | null,
  source: SequenceSource,
): ViewerSequence {
  const buckets = useSequenceBuckets(source.scope, source.from);
  const current = useMonthTiles(month, source, true);
  const index = current.tiles?.tiles.findIndex((tile) => tile.id === itemId) ?? -1;
  const adjacent = adjacentMonths(buckets.data ?? [], month);
  const last = current.tiles !== null && index === current.tiles.tiles.length - 1;
  const newer = useMonthTiles(adjacent.newer, source, index === 0);
  const older = useMonthTiles(adjacent.older, source, last && current.tiles.complete);
  useReadUntil(current, current.tiles !== null && needsMore(current.tiles, itemId));
  useReadUntil(newer, index === 0);
  if (current.tiles === null) return EMPTY_SEQUENCE;
  return sequenceOf(itemId, current.tiles, newer.tiles, older.tiles);
}
