import { useCallback, useMemo } from 'react';
import type { PhotoSource } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { flattenPages } from '../../drive';
import type { SourceSearch } from '../../../api/photos';
import { usePhotoSource } from '../data';
import { sourceDaysOf, sourceTileOf, type SourceDay, type SourceTile } from './source-model';

export interface SourceChipView {
  readonly id: string;
  readonly name: string;
  readonly count: number;
}

export interface SourceView {
  readonly status: 'loading' | 'error' | 'ready';
  readonly error: Error | null;
  readonly tiles: readonly SourceTile[];
  readonly days: readonly SourceDay[];
  readonly chips: readonly SourceChipView[];
  readonly names: ReadonlyMap<string, string>;
  readonly total: number | undefined;
  readonly failedMore: boolean;
  readonly more: () => void;
  readonly retry: () => void;
}

const NO_CHIPS: readonly SourceChipView[] = [];

export function chipNamesOf(chips: readonly SourceChipView[]): ReadonlyMap<string, string> {
  return new Map(chips.map((chip) => [chip.id, chip.name] as const));
}

function statusOf(loaded: boolean, failed: boolean): SourceView['status'] {
  if (loaded) return 'ready';
  return failed ? 'error' : 'loading';
}

export function useSource(
  source: PhotoSource,
  chipId: string | null,
  search: SourceSearch,
): SourceView {
  const pages = usePhotoSource(source, chipId, search);
  const tiles = useMemo(
    () => flattenPages(pages.data, (page) => page.items).map(sourceTileOf),
    [pages.data],
  );
  const days = useMemo(() => sourceDaysOf(tiles), [tiles]);
  const { hasNextPage, isFetchingNextPage, fetchNextPage, refetch } = pages;
  const more = useCallback((): void => {
    if (hasNextPage && !isFetchingNextPage) {
      background(fetchNextPage(), 'photos.sources.next_page_failed', { source });
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, source]);
  const retry = useCallback((): void => {
    background(refetch(), 'photos.sources.retry_failed', { source });
  }, [refetch, source]);
  const chips = pages.data?.pages[0]?.chips ?? NO_CHIPS;
  const names = useMemo(() => chipNamesOf(chips), [chips]);
  const loaded = pages.data !== undefined;
  return {
    status: statusOf(loaded, pages.isError),
    error: pages.error,
    tiles,
    days,
    chips,
    names,
    total: loaded && !hasNextPage ? tiles.length : undefined,
    failedMore: loaded && pages.isError,
    more,
    retry,
  };
}
