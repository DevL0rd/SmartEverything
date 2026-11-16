import type { DriveItem } from '@smarteverything/domain';
import type { StoreContext } from '../context';
import {
  DriveInodesRepository,
  momentOfNs,
  nsOfMoment,
  writeInodeTimes,
  type DriveInode,
  type DriveInodeType,
} from './drive-inodes';

export type SpecialInodeType = Extract<DriveInodeType, 'fifo' | 'socket' | 'char' | 'block'>;

export interface DriveInodePatch {
  readonly id?: number | undefined;
  readonly specialType?: SpecialInodeType | undefined;
  readonly rdev?: number | null | undefined;
  readonly mode?: number | undefined;
  readonly uid?: number | null | undefined;
  readonly gid?: number | null | undefined;
  readonly atimeNs?: bigint | undefined;
  readonly mtimeNs?: bigint | undefined;
  readonly ctimeNs?: bigint | undefined;
  readonly btimeNs?: bigint | undefined;
}

export class DriveInodeError extends Error {
  override readonly name = 'DriveInodeError';
}

export interface DriveInodeChanges {
  readonly mode?: number | undefined;
  readonly uid?: number | null | undefined;
  readonly gid?: number | null | undefined;
  readonly linkTarget?: string | undefined;
  readonly mtimeNs?: bigint | undefined;
}

function typeOf(item: DriveItem, patch: DriveInodePatch): DriveInodeType {
  switch (item.kind) {
    case 'folder':
      return 'dir';
    case 'link':
      return 'symlink';
    case 'special':
      if (patch.specialType === undefined) {
        throw new DriveInodeError(`The special item ${item.id} needs the kind of special file.`);
      }
      return patch.specialType;
    case 'image':
    case 'video':
    case 'audio':
    case 'document':
    case 'other':
      return 'file';
  }
}

function differs<T>(wanted: T | undefined, stored: T): boolean {
  return wanted !== undefined && wanted !== stored;
}

export class DriveItemInodes {
  private readonly inodes: DriveInodesRepository;

  constructor(private readonly context: StoreContext) {
    this.inodes = new DriveInodesRepository(context);
  }

  byId(id: number): DriveInode {
    return this.inodes.byId(id);
  }

  share(item: DriveItem, inodeId: number): number {
    const shared = this.inodes.byId(inodeId);
    if (shared.rootId !== item.rootId) {
      throw new DriveInodeError(
        `The inode ${String(shared.id)} belongs to another drive than the item ${item.id}.`,
      );
    }
    return shared.id;
  }

  create(item: DriveItem, patch: DriveInodePatch): number {
    return this.inodes.create({
      id: patch.id,
      rootId: item.rootId,
      type: typeOf(item, patch),
      mode: patch.mode,
      uid: patch.uid,
      gid: patch.gid,
      rdev: patch.rdev,
      linkTarget: item.kind === 'link' ? item.linkTarget : undefined,
      mtimeNs: patch.mtimeNs ?? nsOfMoment(item.modifiedAt),
      atimeNs: patch.atimeNs,
      ctimeNs: patch.ctimeNs,
      btimeNs: patch.btimeNs ?? nsOfMoment(item.addedAt),
    }).id;
  }

  changes(stored: DriveInode, patch: DriveInodePatch, item: DriveItem): DriveInodeChanges | null {
    const mtimeNs =
      patch.mtimeNs ??
      (momentOfNs(stored.mtimeNs) === item.modifiedAt ? undefined : nsOfMoment(item.modifiedAt));
    const linkTarget = item.kind === 'link' ? item.linkTarget : undefined;
    const changes: DriveInodeChanges = {
      ...(differs(patch.mode, stored.mode) ? { mode: patch.mode } : {}),
      ...(differs(patch.uid, stored.uid) ? { uid: patch.uid } : {}),
      ...(differs(patch.gid, stored.gid) ? { gid: patch.gid } : {}),
      ...(differs(linkTarget, stored.linkTarget) ? { linkTarget } : {}),
      ...(differs(mtimeNs, stored.mtimeNs) ? { mtimeNs } : {}),
    };
    return Object.keys(changes).length === 0 ? null : changes;
  }

  apply(inodeId: number, patch: DriveInodePatch, changes: DriveInodeChanges): void {
    this.inodes.setAttributes(inodeId, {
      mode: changes.mode,
      uid: changes.uid,
      gid: changes.gid,
    });
    if (changes.linkTarget !== undefined) this.inodes.replaceLink(inodeId, changes.linkTarget);
    writeInodeTimes(this.context, inodeId, {
      ctimeNs: patch.ctimeNs ?? nsOfMoment(this.context.now()),
      mtimeNs: changes.mtimeNs,
      atimeNs: patch.atimeNs,
    });
  }
}
