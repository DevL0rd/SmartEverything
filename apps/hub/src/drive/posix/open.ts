import type { RequestMeta } from '@smarteverything/domain/drive-mount';
import { itemAccess } from '../access';
import { orphanRelPath } from '../intents';
import { requireExport } from '../sharing/export-guard';
import { posix } from './errors';
import { nowNs, relatimeDue } from './times';
import type { PosixEnv, PosixScope } from './env';
import type { PosixNodes } from './nodes';

export interface OpenTarget {
  readonly inodeId: number;
  readonly relPath: string;
  readonly size: number;
  readonly rev: number;
  readonly etag: string;
}

export class PosixOpen {
  constructor(
    private readonly env: PosixEnv,
    private readonly nodes: PosixNodes,
  ) {}

  target(scope: PosixScope, ino: number, write: boolean): OpenTarget {
    const node = this.nodes.node(scope, ino);
    if (node.inode.type === 'dir')
      throw posix('EISDIR', 'A folder cannot be opened for its bytes.');
    if (node.inode.type !== 'file') throw posix('EINVAL', 'Only a file has bytes to open.');
    if (write) this.nodes.writable(node);
    const { item } = node;
    if (item === null) {
      return {
        inodeId: node.inode.id,
        relPath: orphanRelPath(node.inode.id),
        size: 0,
        rev: 0,
        etag: `inode-${String(node.inode.id)}`,
      };
    }
    const { store } = this.env.change;
    requireExport(itemAccess(store, scope.caller, store.driveRoots.byId(item.rootId), item), item);
    return {
      inodeId: node.inode.id,
      relPath: item.relPath,
      size: item.bytes,
      rev: item.rev,
      etag: item.etag,
    };
  }

  access(scope: PosixScope, request: RequestMeta<'ACCESS'>): void {
    const { inode } = this.nodes.node(scope, request.ino);
    const now = nowNs(this.env.change);
    if (!request.strict && !relatimeDue(inode, now)) return;
    this.env.change.store.driveInodes.setTimes(inode.id, { atimeNs: now });
  }
}
