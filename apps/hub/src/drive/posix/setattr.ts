import { lutimes } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { SETATTR_VALID, type Attr, type RequestMeta } from '@smarteverything/domain/drive-mount';
import { diskModeOf, locate } from '../intents';
import { commitPatchContent } from '../patch-content';
import { checkDriveWrite } from '../quotas';
import { stageBytes } from '../versions';
import { posix } from './errors';
import { actorOf, recordOp } from './records';
import { after, nowNs } from './times';
import type { PosixEnv, PosixScope } from './env';
import type { PosixNode, PosixNodes } from './nodes';
import type { PosixReads } from './reads';

export type SetattrRequest = RequestMeta<'SETATTR'>;

const PERMISSION_BITS = 0o777;

const NS_PER_MS = 1_000_000n;

function wants(request: SetattrRequest, bit: number): boolean {
  return (request.valid & bit) !== 0;
}

function momentOf(value: bigint | 'now' | undefined, now: bigint): bigint | undefined {
  return value === 'now' ? now : value;
}

export class PosixSetattr {
  constructor(
    private readonly env: PosixEnv,
    private readonly nodes: PosixNodes,
    private readonly reads: PosixReads,
  ) {}

  async setattr(scope: PosixScope, request: SetattrRequest): Promise<Attr> {
    const initial = this.nodes.node(scope, request.ino);
    this.nodes.writable(initial);
    if (wants(request, SETATTR_VALID.size) && request.size !== undefined) {
      await this.truncate(scope, initial, request.size);
    }
    const node = this.nodes.node(scope, request.ino);
    const touched = await this.apply(scope, node, request);
    if (touched && node.item !== null) {
      recordOp(this.env.change, scope.caller, node.item, 'update');
    }
    return this.reads.attr(scope, this.nodes.node(scope, request.ino));
  }

  async stampWrite(scope: PosixScope, ino: number, writtenNs: bigint): Promise<void> {
    const node = this.nodes.node(scope, ino);
    await this.mirror(scope, node, { mode: undefined, atimeNs: undefined, mtimeNs: writtenNs });
    this.env.change.store.driveInodes.setTimes(node.inode.id, {
      mtimeNs: writtenNs,
      ctimeNs: writtenNs,
    });
  }

  private async apply(
    scope: PosixScope,
    node: PosixNode,
    request: SetattrRequest,
  ): Promise<boolean> {
    const inodes = this.env.change.store.driveInodes;
    const attributes = {
      mode: wants(request, SETATTR_VALID.mode) ? request.mode : undefined,
      uid: wants(request, SETATTR_VALID.uid) ? request.uid : undefined,
      gid: wants(request, SETATTR_VALID.gid) ? request.gid : undefined,
    };
    const now = nowNs(this.env.change);
    const times = {
      atimeNs: wants(request, SETATTR_VALID.atime) ? momentOf(request.atime, now) : undefined,
      mtimeNs: wants(request, SETATTR_VALID.mtime) ? momentOf(request.mtime, now) : undefined,
    };
    const metadata =
      Object.values(attributes).some((value) => value !== undefined) ||
      times.atimeNs !== undefined ||
      times.mtimeNs !== undefined;
    if (!metadata) return false;
    await this.mirror(scope, node, { mode: attributes.mode, ...times });
    this.env.change.store.write(() => {
      inodes.setAttributes(node.inode.id, attributes);
      inodes.setTimes(node.inode.id, { ...times, ctimeNs: after(node.inode.ctimeNs, now) });
    });
    return true;
  }

  private async mirror(
    scope: PosixScope,
    node: PosixNode,
    change: { mode: number | undefined; atimeNs: bigint | undefined; mtimeNs: bigint | undefined },
  ): Promise<void> {
    const { item, inode } = node;
    if (item === null || (inode.type !== 'file' && inode.type !== 'dir')) return;
    const path = await locate(this.nodes.root(scope), item.relPath);
    if (change.mode !== undefined) {
      await this.env.change.files.chmod(
        path,
        diskModeOf(change.mode & PERMISSION_BITS, inode.type === 'dir'),
      );
    }
    if (change.atimeNs === undefined && change.mtimeNs === undefined) return;
    const stamp = await this.env.change.files.stamp(path);
    if (stamp === null) throw posix('ENOENT', 'The item is missing from disk.');
    await lutimes(
      path,
      new Date(Number((change.atimeNs ?? inode.atimeNs) / NS_PER_MS)),
      new Date(Number((change.mtimeNs ?? stamp.mtimeNs) / NS_PER_MS)),
    );
  }

  private async truncate(scope: PosixScope, node: PosixNode, size: number): Promise<void> {
    const { inode, item } = node;
    if (inode.type === 'dir') throw posix('EISDIR', 'A folder has no size to change.');
    if (inode.type !== 'file') throw posix('EINVAL', 'Only a file can be truncated.');
    if (item === null) throw posix('ESTALE', 'The file has no name to truncate through.');
    const root = this.nodes.root(scope);
    await checkDriveWrite(this.env.guard, {
      profileId: scope.caller.profileId,
      addBytes: size,
      releasedBytes: item.bytes,
      path: root.path,
    });
    const staged = await stageBytes(this.env.change, root, Readable.from([]));
    await commitPatchContent(this.env.change, {
      root,
      staged,
      relPath: item.relPath,
      patch: { ranges: [], size },
      actor: actorOf(scope.caller),
    });
  }
}
