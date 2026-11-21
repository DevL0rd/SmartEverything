import type { DriveItem } from '@smarteverything/domain';
import type { HostStore } from '../store/host/host-store';
import { isFileItem, type FileItem } from './file-item';

export function namesSharing(
  store: Pick<HostStore, 'driveInodes' | 'driveItems'>,
  existing: FileItem,
): readonly FileItem[] {
  const inode = store.driveInodes.ofItem(existing.id);
  if (inode === undefined) {
    return [];
  }
  return store.driveInodes
    .names(inode.id)
    .filter((id) => id !== existing.id)
    .map((id) => store.driveItems.byId(id, null))
    .filter(isFileItem);
}

export function carryBlocks(
  store: Pick<HostStore, 'driveBlocks'>,
  source: DriveItem,
  names: readonly DriveItem[],
): void {
  const blocks = store.driveBlocks.find(source.id, source.rev);
  if (blocks === undefined) return;
  for (const name of names) {
    store.driveBlocks.put({ ...blocks, itemId: name.id, rev: name.rev });
    store.driveBlocks.removeBefore(name.id, name.rev);
  }
}
