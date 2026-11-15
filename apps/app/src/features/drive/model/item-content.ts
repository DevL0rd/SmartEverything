import type { DriveItem } from '@smarteverything/domain';
import type { EntryKind } from '../../../components/files/file-kind';
import type { IconName } from '../../../components/icon-glyphs';

export type ContentItem = Exclude<DriveItem, { readonly kind: 'folder' | 'link' | 'special' }>;

export type EntryItem = Extract<DriveItem, { readonly kind: 'link' | 'special' }>;

export function isContentItem(item: DriveItem): item is ContentItem {
  return item.kind !== 'folder' && item.kind !== 'link' && item.kind !== 'special';
}

export function isEntryItem(item: DriveItem): item is EntryItem {
  return item.kind === 'link' || item.kind === 'special';
}

export const ENTRY_ICON: Readonly<Record<EntryItem['kind'], IconName>> = {
  link: 'link',
  special: 'cpu',
};

export const ENTRY_LABEL: Readonly<Record<EntryItem['kind'], string>> = {
  link: 'Link',
  special: 'Special file',
};

export const ENTRY_STAYS_LINE = 'It stays on the drive and cannot be opened or downloaded.';

export function entryLineOf(item: EntryItem): string {
  return item.kind === 'link' ? `Points to ${item.linkTarget}` : 'Pipe, socket or device entry';
}

export function entryKindOf(item: DriveItem): EntryKind {
  switch (item.kind) {
    case 'folder':
    case 'link':
      return item.kind;
    case 'special':
      return 'other';
    case 'image':
    case 'video':
    case 'audio':
    case 'document':
    case 'other':
      return 'file';
  }
}

export function thumbReadyOf(item: DriveItem): boolean {
  switch (item.kind) {
    case 'folder':
    case 'link':
    case 'special':
      return false;
    case 'image':
    case 'video':
    case 'audio':
    case 'document':
    case 'other':
      return item.thumb.state === 'ready';
  }
}
