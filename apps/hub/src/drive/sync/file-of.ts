import type { DriveItem } from '@smarteverything/domain';

export type ContentItem = Exclude<DriveItem, { readonly kind: 'folder' | 'link' | 'special' }>;

export function fileOf(item: DriveItem): ContentItem | null {
  return item.kind === 'folder' || item.kind === 'link' || item.kind === 'special' ? null : item;
}
