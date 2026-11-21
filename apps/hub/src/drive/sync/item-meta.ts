import { ApiError, type DriveItem } from '@smarteverything/domain';
import type { SyncXattr } from '@smarteverything/domain/drive-sync';
import type { DriveInode } from '../../store/repositories/drive-inodes';
import type { HostStore } from '../../store/host/host-store';

export type SyncMetaStore = Pick<HostStore, 'driveInodes' | 'driveXattrs'>;

export interface ItemMeta {
  readonly inode: number;
  readonly mode: number;
  readonly mtimeNs: string;
  readonly xattrs: readonly SyncXattr[];
}

export function inodeOfItem(store: SyncMetaStore, item: Pick<DriveItem, 'id'>): DriveInode {
  const inode = store.driveInodes.ofItem(item.id);
  if (inode === undefined) throw new ApiError('internal', `The item ${item.id} has no inode.`);
  return inode;
}

export function xattrsOf(store: SyncMetaStore, inodeId: number): readonly SyncXattr[] {
  return store.driveXattrs.names(inodeId).flatMap((name) => {
    const value = store.driveXattrs.get(inodeId, name);
    return value === undefined ? [] : [{ name, value: Buffer.from(value).toString('base64') }];
  });
}

export function metaOf(store: SyncMetaStore, item: DriveItem): ItemMeta {
  const inode = inodeOfItem(store, item);
  return {
    inode: inode.id,
    mode: inode.mode,
    mtimeNs: inode.mtimeNs.toString(),
    xattrs: item.kind === 'link' ? [] : xattrsOf(store, inode.id),
  };
}
