import { useEffect, useMemo } from 'react';
import { background } from '@smarteverything/logging';
import type { PhotoScope } from '../../../api/photos';
import { tilesOfPage } from '../../../components/media-grid/tiles';
import { flattenPages } from '../../nas/data/pages';
import { usePhotoBuckets, usePhotoMonth } from '../data/queries';
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

function useMonthTiles(month: string | null, scope: PhotoScope, enabled: boolean): MonthRead {
  const pages = usePhotoMonth(month ?? NO_MONTH, scope, enabled && month !== null);
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
  scope: PhotoScope,
): ViewerSequence {
  const buckets = usePhotoBuckets(scope);
  const current = useMonthTiles(month, scope, true);
  const index = current.tiles?.tiles.findIndex((tile) => tile.id === itemId) ?? -1;
  const adjacent = adjacentMonths(buckets.data ?? [], month);
  const last = current.tiles !== null && index === current.tiles.tiles.length - 1;
  const newer = useMonthTiles(adjacent.newer, scope, index === 0);
  const older = useMonthTiles(adjacent.older, scope, last && current.tiles.complete);
  useReadUntil(current, current.tiles !== null && needsMore(current.tiles, itemId));
  useReadUntil(newer, index === 0);
  if (current.tiles === null) return EMPTY_SEQUENCE;
  return sequenceOf(itemId, current.tiles, newer.tiles, older.tiles);
}
