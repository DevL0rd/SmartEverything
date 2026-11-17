import type { DriveItem } from '@smarteverything/domain';
import type { DrivePlaced } from '../store/repositories/drive-item-lookups';
import { DriveWriteError } from './intents';

export type FileItem = Exclude<DriveItem, { readonly kind: 'folder' | 'link' | 'special' }>;

export function isFileItem(item: DriveItem): item is FileItem {
  return item.kind !== 'folder' && item.kind !== 'link' && item.kind !== 'special';
}

function inTheWay(kind: DriveItem['kind']): boolean {
  return kind === 'folder' || kind === 'link' || kind === 'special';
}

export function onlyFilePlaced(placed: DrivePlaced | undefined): DrivePlaced | undefined {
  if (placed !== undefined && inTheWay(placed.kind)) {
    throw new DriveWriteError(
      'exists',
      'A folder, link or special file is in the way of the file.',
    );
  }
  return placed;
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
