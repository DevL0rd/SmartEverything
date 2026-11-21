import type { RequestMeta } from '@smarteverything/domain/drive-mount';
import { orphanRelPath } from '../intents';
import { requireExport } from '../sharing/export-guard';
import { writeDriveOps } from '../units/ops';
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

  async target(scope: PosixScope, ino: number, write: boolean): Promise<OpenTarget> {
    const node = await this.nodes.node(scope, ino);
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
    requireExport(node.access, item);
    return {
      inodeId: node.inode.id,
      relPath: item.relPath,
      size: item.bytes,
      rev: item.rev,
      etag: item.etag,
    };
  }

  async access(scope: PosixScope, request: RequestMeta<'ACCESS'>): Promise<void> {
    const { inode } = await this.nodes.node(scope, request.ino);
    const now = nowNs(this.env.change);
    if (!request.strict && !relatimeDue(inode, now)) return;
    await writeDriveOps(this.env.change.store, [
      { kind: 'times', inodeId: inode.id, times: { atimeNs: now } },
    ]);
  }
}
