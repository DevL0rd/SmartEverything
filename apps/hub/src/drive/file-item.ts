import type { DriveItem } from '@smarteverything/domain';
import { DriveWriteError } from './intents';

export type FileItem = Exclude<DriveItem, { readonly kind: 'folder' | 'link' | 'special' }>;

export function isFileItem(item: DriveItem): item is FileItem {
  return item.kind !== 'folder' && item.kind !== 'link' && item.kind !== 'special';
}

export function onlyFile(item: DriveItem | undefined): FileItem | undefined {
  if (item !== undefined && !isFileItem(item)) {
    throw new DriveWriteError(
      'exists',
      'A folder, link or special file is in the way of the file.',
    );
  }
  return item;
}
