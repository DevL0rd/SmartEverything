import type { DriveItem } from '@smarteverything/domain';
import { INODE_TYPES, utf8Bytes, type Attr } from '@smarteverything/domain/drive-mount';
import type { DriveInode, DriveInodeType } from '../../store/repositories/drive-inodes';

export const DIRECTORY_BYTES = 4096;

export const BLOCK_UNIT_BYTES = 512;

const TYPES: Readonly<Record<DriveInodeType, Attr['type']>> = {
  file: INODE_TYPES.file,
  dir: INODE_TYPES.directory,
  symlink: INODE_TYPES.symlink,
  fifo: INODE_TYPES.fifo,
  socket: INODE_TYPES.socket,
  char: INODE_TYPES.char,
  block: INODE_TYPES.block,
};

export function sizeOf(inode: DriveInode, item: DriveItem | null): number {
  if (inode.type === 'dir') return DIRECTORY_BYTES;
  if (inode.type === 'symlink') return utf8Bytes(inode.linkTarget ?? '');
  return inode.type === 'file' ? (item?.bytes ?? 0) : 0;
}

export interface AttrSource {
  readonly inode: DriveInode;
  readonly item: DriveItem | null;
  readonly nlink: number;
  readonly size: number;
}

export function attrOf(source: AttrSource): Attr {
  const { inode, item, nlink, size } = source;
  return {
    ino: inode.id,
    type: TYPES[inode.type],
    mode: inode.mode,
    nlink,
    uid: inode.uid,
    gid: inode.gid,
    size,
    blocks: Math.ceil(size / BLOCK_UNIT_BYTES),
    atimeNs: inode.atimeNs,
    mtimeNs: inode.mtimeNs,
    ctimeNs: inode.ctimeNs,
    btimeNs: inode.btimeNs,
    rdev: inode.rdev ?? 0,
    rev: item?.rev ?? 0,
    etag: item?.etag ?? `inode-${String(inode.id)}`,
  };
}
