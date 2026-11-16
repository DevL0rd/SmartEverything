import { SETATTR_VALID, type Attr, type RequestMeta } from '@smarteverything/domain/drive-mount';
import type { DriveDiskStat, DriveInodeTimes } from '../../store/repositories/drive-inodes';
import { diskModeOf, locate } from '../intents';
import { commitPatchContent } from '../patch-content';
import { checkDriveWrite } from '../quotas';
import { stageEmpty } from '../stage-empty';
import { posix } from './errors';
import { actorOf, recordOp } from './records';
import { after, nowNs, stampDiskTimes } from './times';
import type { PosixEnv, PosixScope } from './env';
import type { PosixNode, PosixNodes } from './nodes';
import type { PosixReads } from './reads';

export type SetattrRequest = RequestMeta<'SETATTR'>;

export interface WrittenTimes {
  readonly mtimeNs: bigint;
  readonly atimeNs: bigint | undefined;
}

const PERMISSION_BITS = 0o777;

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

  async stampWrite(scope: PosixScope, ino: number, written: WrittenTimes): Promise<void> {
    const node = this.nodes.node(scope, ino);
    const disk = await this.mirror(scope, node, { mode: undefined, ...written });
    this.writeTimes(
      node,
      { atimeNs: written.atimeNs, mtimeNs: written.mtimeNs, ctimeNs: written.mtimeNs },
      disk,
    );
  }

  private writeTimes(node: PosixNode, times: DriveInodeTimes, disk: DriveDiskStat | null): void {
    const inodes = this.env.change.store.driveInodes;
    if (disk === null) inodes.setTimes(node.inode.id, times);
    else inodes.setTimesOnDisk(node.inode.id, times, disk);
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
    const disk = await this.mirror(scope, node, { mode: attributes.mode, ...times });
    this.env.change.store.write(() => {
      inodes.setAttributes(node.inode.id, attributes);
      this.writeTimes(node, { ...times, ctimeNs: after(node.inode.ctimeNs, now) }, disk);
    });
    return true;
  }

  private async mirror(
    scope: PosixScope,
    node: PosixNode,
    change: { mode: number | undefined; atimeNs: bigint | undefined; mtimeNs: bigint | undefined },
  ): Promise<DriveDiskStat | null> {
    const { item, inode } = node;
    if (item === null || (inode.type !== 'file' && inode.type !== 'dir')) return null;
    const path = await locate(this.nodes.root(scope), item.relPath);
    if (change.mode !== undefined) {
      await this.env.change.files.chmod(
        path,
        diskModeOf(change.mode & PERMISSION_BITS, inode.type === 'dir'),
      );
    }
    if (change.atimeNs === undefined && change.mtimeNs === undefined) return null;
    return this.stampDisk(path, inode, change);
  }

  private async stampDisk(
    path: string,
    inode: PosixNode['inode'],
    change: { atimeNs: bigint | undefined; mtimeNs: bigint | undefined },
  ): Promise<DriveDiskStat> {
    const stamp = await this.env.change.files.stamp(path);
    if (stamp === null) throw posix('ENOENT', 'The item is missing from disk.');
    await stampDiskTimes(path, change.atimeNs ?? inode.atimeNs, change.mtimeNs ?? stamp.mtimeNs);
    const landed = await this.env.change.files.stamp(path);
    if (landed === null) throw posix('ENOENT', 'The item left the disk while its times were set.');
    return { mtimeNs: landed.mtimeNs, bytes: inode.type === 'file' ? landed.size : null };
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
    const staged = await stageEmpty(this.env.change, root);
    await commitPatchContent(this.env.change, {
      root,
      staged,
      relPath: item.relPath,
      patch: { ranges: [], size },
      actor: actorOf(scope.caller),
    });
  }
}
