import { MAX_FRAME_BYTES, type Attr } from '@smarteverything/domain/drive-mount';
import type { DriveItemEntry } from '../../store/repositories/drive-items';
import { orphanRelPath } from '../intents';
import { locate } from '../intents';
import { attrOf, sizeOf } from './attr';
import { posix } from './errors';
import type { PosixEnv, PosixScope } from './env';
import type { PosixNode, PosixNodes } from './nodes';

const ENTRY_BYTES = 640;

export const READDIR_PAGE = Math.floor(MAX_FRAME_BYTES / (2 * ENTRY_BYTES));

export type DirectoryEntry = readonly [name: string, ino: number, attr: Attr];

export interface DirectoryPage {
  readonly entries: readonly DirectoryEntry[];
  readonly next: number | null;
}

export interface Entry {
  readonly ino: number;
  readonly attr: Attr;
}

export class PosixReads {
  constructor(
    private readonly env: PosixEnv,
    private readonly nodes: PosixNodes,
  ) {}

  private get store(): PosixEnv['change']['store'] {
    return this.env.change.store;
  }

  async attr(scope: PosixScope, node: PosixNode): Promise<Attr> {
    const { inode, item } = node;
    const nlink = this.store.driveInodes.linkCount(inode.id);
    const size =
      item === null && inode.type === 'file'
        ? await this.orphanSize(scope, inode.id)
        : sizeOf(inode, item);
    return attrOf({ inode, item, nlink, size });
  }

  private async orphanSize(scope: PosixScope, inodeId: number): Promise<number> {
    const path = await locate(this.nodes.root(scope), orphanRelPath(inodeId));
    return (await this.env.change.files.stamp(path))?.size ?? 0;
  }

  async getattr(scope: PosixScope, ino: number): Promise<Attr> {
    return this.attr(scope, this.nodes.node(scope, ino));
  }

  async lookup(scope: PosixScope, request: { parent: number; name: string }): Promise<Entry> {
    const parent = this.nodes.directory(scope, request.parent);
    const child = this.nodes.childOf(scope, parent, request.name);
    if (child === undefined) throw posix('ENOENT', `${request.name} does not exist.`);
    return { ino: child.inode.id, attr: await this.attr(scope, child) };
  }

  readlink(scope: PosixScope, ino: number): string {
    const { inode } = this.nodes.node(scope, ino);
    if (inode.type !== 'symlink' || inode.linkTarget === null) {
      throw posix('EINVAL', 'That is not a symbolic link.');
    }
    return inode.linkTarget;
  }

  readdir(scope: PosixScope, request: { ino: number; cursor: number }): DirectoryPage {
    const directory = this.nodes.directory(scope, request.ino);
    const key = `${String(request.ino)}:${String(request.cursor)}`;
    const memo = scope.cursors.get(key);
    scope.cursors.delete(key);
    const after =
      request.cursor === 0 ? null : (memo ?? this.nameAt(scope, directory, request.cursor));
    const window = this.window(scope, directory, after);
    const base = this.nodes.base(scope);
    const visible = window.entries.filter(
      (entry) => this.nodes.accessIn(scope, base, entry.item) !== 'none',
    );
    const next = request.cursor + visible.length;
    if (window.next !== null)
      scope.cursors.set(`${String(request.ino)}:${String(next)}`, window.next);
    return { entries: this.entriesOf(visible), next: window.next === null ? null : next };
  }

  private window(
    scope: PosixScope,
    directory: PosixNode,
    after: string | null,
  ): { entries: readonly DriveItemEntry[]; next: string | null } {
    return this.store.driveItems.children({
      rootId: scope.drive.id,
      parentId: directory.item?.id ?? null,
      after,
      limit: READDIR_PAGE,
      viewer: null,
    });
  }

  private nameAt(scope: PosixScope, directory: PosixNode, cursor: number): string {
    const base = this.nodes.base(scope);
    let counted = 0;
    let after: string | null = null;
    for (;;) {
      const window = this.window(scope, directory, after);
      for (const entry of window.entries) {
        if (this.nodes.accessIn(scope, base, entry.item) !== 'none') counted += 1;
        if (counted === cursor) return entry.item.name;
      }
      if (window.next === null) throw posix('EINVAL', 'The folder cursor is past the end.');
      after = window.next;
    }
  }

  private entriesOf(entries: readonly DriveItemEntry[]): readonly DirectoryEntry[] {
    const ids = entries.map((entry) => entry.inodeId);
    const inodes = new Map(this.store.driveInodes.findMany(ids).map((inode) => [inode.id, inode]));
    const links = this.store.driveInodes.linkCounts(ids);
    return entries.map((entry): DirectoryEntry => {
      const inode = inodes.get(entry.inodeId);
      if (inode === undefined) throw posix('EIO', `The item ${entry.item.id} has no inode.`);
      const attr = attrOf({
        inode,
        item: entry.item,
        nlink: links.get(inode.id) ?? 0,
        size: sizeOf(inode, entry.item),
      });
      return [entry.item.name, inode.id, attr];
    });
  }
}
