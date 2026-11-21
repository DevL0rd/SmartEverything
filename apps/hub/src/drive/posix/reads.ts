import type { Attr } from '@smarteverything/domain/drive-mount';
import { orphanRelPath } from '../intents';
import { locate } from '../intents';
import type { DirectoryEntry, PosixNode } from '../units/posix';
import { attrOf, sizeOf } from './attr';
import { posix } from './errors';
import type { PosixEnv, PosixScope } from './env';
import { nodeScopeOf, type PosixNodes } from './nodes';

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

  async attr(scope: PosixScope, node: PosixNode): Promise<Attr> {
    const { inode, item, nlink } = node;
    const size =
      item === null && inode.type === 'file'
        ? await this.orphanSize(scope, inode.id)
        : sizeOf(inode, item);
    return attrOf({ inode, item, nlink, size });
  }

  private async orphanSize(scope: PosixScope, inodeId: number): Promise<number> {
    const path = await locate(await this.nodes.root(scope), orphanRelPath(inodeId));
    return (await this.env.change.files.stamp(path))?.size ?? 0;
  }

  async getattr(scope: PosixScope, ino: number): Promise<Attr> {
    return this.attr(scope, await this.nodes.node(scope, ino));
  }

  async lookup(scope: PosixScope, request: { parent: number; name: string }): Promise<Entry> {
    const { child } = await this.nodes.childIn(scope, request.parent, request.name);
    if (child === undefined) throw posix('ENOENT', `${request.name} does not exist.`);
    return { ino: child.inode.id, attr: await this.attr(scope, child) };
  }

  async readlink(scope: PosixScope, ino: number): Promise<string> {
    const { inode } = await this.nodes.node(scope, ino);
    if (inode.type !== 'symlink' || inode.linkTarget === null) {
      throw posix('EINVAL', 'That is not a symbolic link.');
    }
    return inode.linkTarget;
  }

  async readdir(
    scope: PosixScope,
    request: { ino: number; cursor: number },
  ): Promise<DirectoryPage> {
    const key = `${String(request.ino)}:${String(request.cursor)}`;
    const memo = scope.cursors.get(key);
    scope.cursors.delete(key);
    const window = await this.env.change.store.host.read('drivePosixDirectory', {
      scope: nodeScopeOf(scope),
      ino: request.ino,
      cursor: request.cursor,
      after: memo ?? null,
    });
    const next = request.cursor + window.entries.length;
    if (window.next !== null)
      scope.cursors.set(`${String(request.ino)}:${String(next)}`, window.next);
    return { entries: window.entries, next: window.next === null ? null : next };
  }
}
