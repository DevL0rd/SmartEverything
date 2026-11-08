import type { DriveItem } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useStableCallback } from '../../../design/use-stable-callback';
import { count } from '../../../format/number';
import { flattenPages } from '../../nas/data/pages';
import { usePhotoMemoryItems } from '../data';

export type MemoryMedia = Extract<DriveItem, { readonly kind: 'image' | 'video' }>;

export function isMedia(item: DriveItem): item is MemoryMedia {
  return item.kind === 'image' || item.kind === 'video';
}

export function coverFirst(
  items: readonly MemoryMedia[],
  coverItemId: string,
): readonly MemoryMedia[] {
  const cover = items.find((item) => item.id === coverItemId);
  return cover === undefined ? items : [cover, ...items.filter((item) => item !== cover)];
}

export const STRIP_SIZE = 4;

export function stripOf(
  items: readonly MemoryMedia[],
  coverItemId: string,
): readonly MemoryMedia[] {
  return coverFirst(items, coverItemId).slice(1, STRIP_SIZE + 1);
}

export function restText(total: number, shown: number): string | null {
  const rest = total - 1 - shown;
  return rest > 0 ? `+${count(rest)}` : null;
}

export interface MemoryItems {
  readonly items: readonly MemoryMedia[];
  readonly loading: boolean;
  readonly error: Error | null;
  readonly more: boolean;
  readonly loadMore: () => void;
}

export function useMemoryItems(memoryId: string): MemoryItems {
  const pages = usePhotoMemoryItems(memoryId);
  const items = flattenPages(pages.data, (page) => page.items).filter(isMedia);
  const loadMore = useStableCallback((): void => {
    if (!pages.hasNextPage || pages.isFetchingNextPage) return;
    background(pages.fetchNextPage(), 'photos.memory_items_page_failed', { memoryId });
  });
  return {
    items,
    loading: pages.isPending,
    error: pages.error,
    more: pages.hasNextPage,
    loadMore,
  };
}
