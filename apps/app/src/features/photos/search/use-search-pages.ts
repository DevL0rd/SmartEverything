import { useCallback, useMemo } from 'react';
import { background } from '@smarteverything/logging';
import type { MediaTile } from '../../../components/media-grid/tiles';
import { flattenPages } from '../../nas/data/pages';
import { usePhotoSearch } from '../data';
import { searchOf, type SearchInput } from './query';
import { resultSummaryOf, tilesOfItems, type ResultSummary } from './results';

export type SearchPagesState = 'loading' | 'error' | 'ready';

export interface SearchPages {
  readonly state: SearchPagesState;
  readonly error: unknown;
  readonly failedMore: boolean;
  readonly tiles: readonly MediaTile[];
  readonly ids: readonly string[];
  readonly summary: ResultSummary;
  readonly more: () => void;
  readonly retry: () => void;
}

function stateOf(loaded: boolean, failed: boolean): SearchPagesState {
  if (loaded) return 'ready';
  return failed ? 'error' : 'loading';
}

export function useSearchPages(search: SearchInput, enabled: boolean): SearchPages {
  const query = usePhotoSearch(searchOf(search), enabled);
  const items = useMemo(() => flattenPages(query.data, (page) => page.items), [query.data]);
  const tiles = useMemo(() => tilesOfItems(items), [items]);
  const ids = useMemo(() => tiles.map((tile) => tile.id), [tiles]);
  const { hasNextPage, isFetchingNextPage, fetchNextPage, refetch } = query;
  const more = useCallback((): void => {
    if (hasNextPage && !isFetchingNextPage) {
      background(fetchNextPage(), 'photos.search_next_page_failed');
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  const retry = useCallback((): void => {
    background(refetch(), 'photos.search_retry_failed');
  }, [refetch]);
  const loaded = query.data !== undefined;
  return {
    state: stateOf(loaded, query.isError),
    error: query.error,
    failedMore: loaded && query.isError,
    tiles,
    ids,
    summary: resultSummaryOf(items, !hasNextPage),
    more,
    retry,
  };
}
