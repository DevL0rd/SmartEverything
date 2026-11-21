import type { DriveItem } from '@smarteverything/domain';
import { MAX_FRAME_BYTES, type Attr } from '@smarteverything/domain/drive-mount';
import type { DriveInode } from '../../store/repositories/drive-inodes';
import type { DriveItemEntry } from '../../store/repositories/drive-items';
import type { Store } from '../../store/store';
import { storeUnit } from '../../store/host/unit';
import { driveAccess, itemAccess, type DriveActor, type ItemAccess } from '../access';
import { attrOf, sizeOf } from '../posix/attr';
import { PosixError, posix } from '../posix/errors';
import { isReservedPath } from '../posix/reserved';

const OUTSIDE = new Set<string>(['ENOENT', 'ESTALE']);

const ENTRY_BYTES = 640;

export const READDIR_PAGE = Math.floor(MAX_FRAME_BYTES / (2 * ENTRY_BYTES));

export interface PosixNode {
  readonly inode: DriveInode;
  readonly item: DriveItem | null;
  readonly access: ItemAccess;
  readonly nlink: number;
}

export interface PosixChild extends PosixNode {
  readonly item: DriveItem;
}

export interface NodeScope {
  readonly driveId: string;
  readonly baseId: string | null;
  readonly caller: DriveActor;
}

export type NodeMode = 'node' | 'crossing' | 'directory';

export interface NodeInput {
  readonly scope: NodeScope;
  readonly ino: number;
  readonly mode: NodeMode;
}

export interface ChildInput {
  readonly scope: NodeScope;
  readonly parentIno: number;
  readonly crossing: boolean;
  readonly name: string;
}

export interface FoundChild {
  readonly parent: PosixNode;
  readonly child: PosixChild | undefined;
}

export type DirectoryEntry = readonly [name: string, ino: number, attr: Attr];

export interface DirectoryInput {
  readonly scope: NodeScope;
  readonly ino: number;
  readonly cursor: number;
  readonly after: string | null;
}

export interface DirectoryWindow {
  readonly entries: readonly DirectoryEntry[];
  readonly next: string | null;
}

class NodeReader {
  private baseItem: DriveItem | null | undefined;

  constructor(
    private readonly store: Store,
    private readonly scope: NodeScope,
  ) {}

  private base(): DriveItem | null {
    if (this.baseItem === undefined) {
      this.baseItem =
        this.scope.baseId === null ? null : this.store.driveItems.byId(this.scope.baseId, null);
    }
    return this.baseItem;
  }

  private rootAccess(): ItemAccess {
    const access = driveAccess(this.scope.caller, this.store.driveRoots.byId(this.scope.driveId));
    if (access === 'none') throw posix('ENOENT', 'There is no such drive for this person.');
    return access;
  }

  accessIn(item: DriveItem): ItemAccess {
    const base = this.base();
    const inside =
      base === null || item.id === base.id || item.relPath.startsWith(`${base.relPath}/`);
    if (!inside || isReservedPath(item.relPath)) return 'none';
    const root = this.store.driveRoots.byId(this.scope.driveId);
    return itemAccess(this.store, this.scope.caller, root, item);
  }

  private inodeOf(ino: number): DriveInode {
    const inode = this.store.driveInodes.find(ino);
    if (inode?.rootId !== this.scope.driveId) {
      throw posix('ESTALE', `The inode ${String(ino)} is not in this drive.`);
    }
    return inode;
  }

  private linked(inode: DriveInode, item: DriveItem | null, access: ItemAccess): PosixNode {
    return { inode, item, access, nlink: this.store.driveInodes.linkCount(inode.id) };
  }

  node(ino: number): PosixNode {
    const inode = this.inodeOf(ino);
    if (inode.isRoot) {
      if (this.base() !== null) throw posix('ESTALE', 'The drive root is outside this mount.');
      return this.linked(inode, null, this.rootAccess());
    }
    const names = this.store.driveInodes.names(ino);
    if (names.length === 0) {
      if (!inode.orphan) throw posix('ESTALE', `The inode ${String(ino)} has no name.`);
      return this.linked(inode, null, this.rootAccess());
    }
    for (const id of names) {
      const item = this.store.driveItems.find(id, null);
      const access = item === undefined ? 'none' : this.accessIn(item);
      if (item !== undefined && access !== 'none') return this.linked(inode, item, access);
    }
    throw posix('ENOENT', `There is no name of inode ${String(ino)} visible here.`);
  }

  crossing(ino: number): PosixNode {
    const stored = this.store.driveInodes.find(ino);
    if (stored !== undefined && stored.rootId !== this.scope.driveId) {
      throw posix('EXDEV', 'That inode is in another drive.');
    }
    try {
      return this.node(ino);
    } catch (cause) {
      if (stored !== undefined && cause instanceof PosixError && OUTSIDE.has(cause.code)) {
        throw posix('EXDEV', 'That inode is outside this mount.');
      }
      throw cause;
    }
  }

  directory(ino: number): PosixNode {
    const node = this.node(ino);
    if (node.inode.type !== 'dir') throw posix('ENOTDIR', 'That is not a folder.');
    return node;
  }

  childOf(parent: PosixNode, name: string): PosixChild | undefined {
    const relPath = parent.item === null ? name : `${parent.item.relPath}/${name}`;
    const item = this.store.driveItems.byPath(this.scope.driveId, relPath, null);
    if (item === undefined) return undefined;
    const access = this.accessIn(item);
    if (access === 'none') return undefined;
    const inode = this.store.driveInodes.ofItem(item.id);
    if (inode === undefined) throw posix('EIO', `The item ${item.id} has no inode.`);
    return { inode, item, access, nlink: this.store.driveInodes.linkCount(inode.id) };
  }

  window(directory: PosixNode, after: string | null): ReturnType<Store['driveItems']['children']> {
    return this.store.driveItems.children({
      rootId: this.scope.driveId,
      parentId: directory.item?.id ?? null,
      after,
      limit: READDIR_PAGE,
      viewer: null,
    });
  }

  nameAt(directory: PosixNode, cursor: number): string {
    let counted = 0;
    let after: string | null = null;
    for (;;) {
      const window = this.window(directory, after);
      for (const entry of window.entries) {
        if (this.accessIn(entry.item) !== 'none') counted += 1;
        if (counted === cursor) return entry.item.name;
      }
      if (window.next === null) throw posix('EINVAL', 'The folder cursor is past the end.');
      after = window.next;
    }
  }

  entriesOf(entries: readonly DriveItemEntry[]): DirectoryEntry[] {
    const ids = entries.map((entry) => entry.inodeId);
    const inodes = new Map(this.store.driveInodes.findMany(ids).map((inode) => [inode.id, inode]));
    const links = this.store.driveInodes.linkCounts(ids);
    return entries.map((entry): DirectoryEntry => {
      const inode = inodes.get(entry.inodeId);
      if (inode === undefined) throw posix('EIO', `The item ${entry.item.id} has no inode.`);
      const nlink = links.get(inode.id);
      if (nlink === undefined) throw posix('EIO', `The inode ${String(inode.id)} has no names.`);
      const attr = attrOf({ inode, item: entry.item, nlink, size: sizeOf(inode, entry.item) });
      return [entry.item.name, inode.id, attr];
    });
  }
}

export function nodeIn(store: Store, input: NodeInput): PosixNode {
  const reader = new NodeReader(store, input.scope);
  if (input.mode === 'crossing') return reader.crossing(input.ino);
  return input.mode === 'directory' ? reader.directory(input.ino) : reader.node(input.ino);
}

export function childIn(store: Store, input: ChildInput): FoundChild {
  const reader = new NodeReader(store, input.scope);
  const parent = input.crossing ? reader.crossing(input.parentIno) : reader.node(input.parentIno);
  if (parent.inode.type !== 'dir') throw posix('ENOTDIR', 'That is not a folder.');
  return { parent, child: reader.childOf(parent, input.name) };
}

export function directoryIn(store: Store, input: DirectoryInput): DirectoryWindow {
  const reader = new NodeReader(store, input.scope);
  const directory = reader.directory(input.ino);
  const after = input.cursor === 0 ? null : (input.after ?? reader.nameAt(directory, input.cursor));
  const window = reader.window(directory, after);
  const visible = window.entries.filter((entry) => reader.accessIn(entry.item) !== 'none');
  return { entries: reader.entriesOf(visible), next: window.next };
}

export const DRIVE_POSIX_NODE_UNIT = storeUnit((store, input: NodeInput) => nodeIn(store, input));

export const DRIVE_POSIX_CHILD_UNIT = storeUnit((store, input: ChildInput) =>
  childIn(store, input),
);

export const DRIVE_POSIX_DIRECTORY_UNIT = storeUnit((store, input: DirectoryInput) =>
  directoryIn(store, input),
);
