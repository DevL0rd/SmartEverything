import type { DriveItem } from '@smarteverything/domain';
import type { DriveInode } from '../../store/repositories/drive-inodes';
import type { StoredDrive } from '../../store/repositories/drive-roots';
import { canWrite, driveAccess, itemAccess, type ItemAccess } from '../access';
import { PosixError, posix } from './errors';
import { checkName, isReservedPath } from './names';
import type { PosixEnv, PosixScope } from './env';

const OUTSIDE = new Set<string>(['ENOENT', 'ESTALE']);

export interface PosixNode {
  readonly inode: DriveInode;
  readonly item: DriveItem | null;
  readonly access: ItemAccess;
}

export interface PosixChild extends PosixNode {
  readonly item: DriveItem;
}

export class PosixNodes {
  constructor(private readonly env: PosixEnv) {}

  private get store(): PosixEnv['change']['store'] {
    return this.env.change.store;
  }

  root(scope: PosixScope): StoredDrive {
    return this.store.driveRoots.byId(scope.drive.id);
  }

  base(scope: PosixScope): DriveItem | null {
    return scope.baseId === null ? null : this.store.driveItems.byId(scope.baseId, null);
  }

  inodeOf(scope: PosixScope, ino: number): DriveInode {
    const inode = this.store.driveInodes.find(ino);
    if (inode?.rootId !== scope.drive.id) {
      throw posix('ESTALE', `The inode ${String(ino)} is not in this drive.`);
    }
    return inode;
  }

  private rootAccess(scope: PosixScope): ItemAccess {
    const access = driveAccess(scope.caller, this.root(scope));
    if (access === 'none') throw posix('ENOENT', 'There is no such drive for this person.');
    return access;
  }

  accessIn(scope: PosixScope, base: DriveItem | null, item: DriveItem): ItemAccess {
    const inside =
      base === null || item.id === base.id || item.relPath.startsWith(`${base.relPath}/`);
    if (!inside || isReservedPath(item.relPath)) return 'none';
    return itemAccess(this.store, scope.caller, this.root(scope), item);
  }

  node(scope: PosixScope, ino: number): PosixNode {
    const inode = this.inodeOf(scope, ino);
    const base = this.base(scope);
    if (inode.isRoot) {
      if (base !== null) throw posix('ESTALE', 'The drive root is outside this mount.');
      return { inode, item: null, access: this.rootAccess(scope) };
    }
    const names = this.store.driveInodes.names(ino);
    if (names.length === 0) {
      if (!inode.orphan) throw posix('ESTALE', `The inode ${String(ino)} has no name.`);
      return { inode, item: null, access: this.rootAccess(scope) };
    }
    for (const id of names) {
      const item = this.store.driveItems.find(id, null);
      const access = item === undefined ? 'none' : this.accessIn(scope, base, item);
      if (item !== undefined && access !== 'none') return { inode, item, access };
    }
    throw posix('ENOENT', `There is no name of inode ${String(ino)} visible here.`);
  }

  crossing(scope: PosixScope, ino: number): PosixNode {
    const stored = this.store.driveInodes.find(ino);
    if (stored !== undefined && stored.rootId !== scope.drive.id) {
      throw posix('EXDEV', 'That inode is in another drive.');
    }
    try {
      return this.node(scope, ino);
    } catch (cause) {
      if (stored !== undefined && cause instanceof PosixError && OUTSIDE.has(cause.code)) {
        throw posix('EXDEV', 'That inode is outside this mount.');
      }
      throw cause;
    }
  }

  directory(scope: PosixScope, ino: number): PosixNode {
    const node = this.node(scope, ino);
    if (node.inode.type !== 'dir') throw posix('ENOTDIR', 'That is not a folder.');
    return node;
  }

  relPathOf(parent: PosixNode, name: string): string {
    return parent.item === null ? name : `${parent.item.relPath}/${name}`;
  }

  childOf(scope: PosixScope, parent: PosixNode, name: string): PosixChild | undefined {
    checkName(name);
    const item = this.store.driveItems.byPath(scope.drive.id, this.relPathOf(parent, name), null);
    if (item === undefined) return undefined;
    const access = this.accessIn(scope, this.base(scope), item);
    if (access === 'none') return undefined;
    const inode = this.store.driveInodes.ofItem(item.id);
    if (inode === undefined) throw posix('EIO', `The item ${item.id} has no inode.`);
    return { inode, item, access };
  }

  writable(node: PosixNode): void {
    if (!canWrite(node.access))
      throw posix('EACCES', 'You can only view this; you cannot change it.');
  }
}
