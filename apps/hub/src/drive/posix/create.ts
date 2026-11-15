import { symlink, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import { INODE_TYPES, type RequestMeta } from '@smarteverything/domain/drive-mount';
import type { DriveInode } from '../../store/repositories/drive-inodes';
import type { SpecialInodeType } from '../../store/repositories/drive-item-inodes';
import { commitContent, folderDraft, identityOf, isoOf, type NewItem } from '../changes';
import { diskModeOf, locate, orphanRelPath } from '../intents';
import { stageBytes } from '../versions';
import { linkDraft, NO_IDENTITY, specialDraft } from './drafts';
import { posix } from './errors';
import { checkName, checkNewPath } from './names';
import { actorOf, recordNew, touchDirectory } from './records';
import { nowNs } from './times';
import type { PosixEnv, PosixScope } from './env';
import type { PosixChild, PosixNode, PosixNodes } from './nodes';
import type { Entry, PosixReads } from './reads';

const PERMISSION_BITS = 0o777;

const SYMLINK_MODE = 0o777;

const SPECIAL_TYPES: Readonly<Record<number, SpecialInodeType>> = {
  [INODE_TYPES.fifo]: 'fifo',
  [INODE_TYPES.socket]: 'socket',
  [INODE_TYPES.char]: 'char',
  [INODE_TYPES.block]: 'block',
};

interface Prepared {
  readonly parent: PosixNode;
  readonly relPath: string;
  readonly existing: PosixChild | undefined;
}

interface Owner {
  readonly uid: number | null;
  readonly gid: number | null;
}

export class PosixCreate {
  constructor(
    private readonly env: PosixEnv,
    private readonly nodes: PosixNodes,
    private readonly reads: PosixReads,
  ) {}

  private prepare(scope: PosixScope, parentIno: number, name: string): Prepared {
    checkName(name);
    const parent = this.nodes.directory(scope, parentIno);
    this.nodes.writable(parent);
    const relPath = this.nodes.relPathOf(parent, name);
    checkNewPath(relPath);
    return { parent, relPath, existing: this.nodes.childOf(scope, parent, name) };
  }

  private async prepareFree(scope: PosixScope, parentIno: number, name: string): Promise<Prepared> {
    const prepared = this.prepare(scope, parentIno, name);
    if (prepared.existing !== undefined) throw posix('EEXIST', `${name} already exists.`);
    const path = await locate(this.nodes.root(scope), prepared.relPath);
    if ((await this.env.change.files.stamp(path)) !== null) {
      throw posix('EEXIST', `${name} is already on disk.`);
    }
    return prepared;
  }

  private newItem(scope: PosixScope, prepared: Prepared, mtimeNs: bigint): NewItem {
    return {
      rootId: scope.drive.id,
      parentId: prepared.parent.item?.id ?? null,
      relPath: prepared.relPath,
      modifiedAt: isoOf(mtimeNs),
      addedAt: this.env.change.now().toISOString(),
      outside: false,
      addedByProfileId: scope.caller.profileId,
    };
  }

  private async entryOf(scope: PosixScope, itemId: string, parent: PosixNode): Promise<Entry> {
    touchDirectory(this.env.change, parent);
    const inode = this.env.change.store.driveInodes.ofItem(itemId);
    if (inode === undefined) throw posix('EIO', `The item ${itemId} has no inode.`);
    const attr = await this.reads.attr(scope, this.nodes.node(scope, inode.id));
    return { ino: inode.id, attr };
  }

  async mkdir(scope: PosixScope, request: RequestMeta<'MKDIR'>): Promise<Entry> {
    const prepared = await this.prepareFree(scope, request.parent, request.name);
    const { files } = this.env.change;
    const path = await locate(this.nodes.root(scope), prepared.relPath);
    await files.mkdir(path);
    await files.chmod(path, diskModeOf(request.mode & PERMISSION_BITS, true));
    const stamp = await files.stamp(path);
    if (stamp === null) throw posix('EIO', 'The new folder is missing after it was made.');
    const item = recordNew(this.env.change, scope.caller, {
      draft: folderDraft(this.newItem(scope, prepared, stamp.mtimeNs), 0),
      identity: identityOf(stamp),
      inode: { mode: request.mode, uid: request.uid, gid: request.gid, mtimeNs: stamp.mtimeNs },
    });
    return this.entryOf(scope, item.id, prepared.parent);
  }

  async create(scope: PosixScope, request: RequestMeta<'CREATE'>): Promise<Entry> {
    const prepared = this.prepare(scope, request.parent, request.name);
    const { existing } = prepared;
    if (existing !== undefined) return this.existing(scope, existing, request.exclusive);
    const root = this.nodes.root(scope);
    const staged = await stageBytes(this.env.change, root, Readable.from([]));
    try {
      const written = await commitContent(this.env.change, {
        root,
        staged,
        relPath: prepared.relPath,
        actor: actorOf(scope.caller),
        mode: request.mode & PERMISSION_BITS,
      });
      this.owned(written.item.id, request);
      return await this.entryOf(scope, written.item.id, prepared.parent);
    } catch (cause) {
      await this.env.change.files.remove(await locate(root, staged.relPath));
      throw cause;
    }
  }

  private owned(itemId: string, owner: Owner & { readonly mode: number }): void {
    const inodes = this.env.change.store.driveInodes;
    const inode = inodes.ofItem(itemId);
    if (inode === undefined) throw posix('EIO', `The item ${itemId} has no inode.`);
    inodes.setAttributes(inode.id, { mode: owner.mode, uid: owner.uid, gid: owner.gid });
  }

  private async existing(scope: PosixScope, found: PosixChild, exclusive: boolean): Promise<Entry> {
    if (exclusive) throw posix('EEXIST', `${found.item.name} already exists.`);
    if (found.inode.type === 'dir') throw posix('EISDIR', 'A folder is in the way of the file.');
    if (found.inode.type !== 'file') throw posix('EEXIST', 'A link or special file is in the way.');
    return { ino: found.inode.id, attr: await this.reads.attr(scope, found) };
  }

  async mknod(scope: PosixScope, request: RequestMeta<'MKNOD'>): Promise<Entry> {
    const prepared = this.prepare(scope, request.parent, request.name);
    if (prepared.existing !== undefined) throw posix('EEXIST', `${request.name} already exists.`);
    const specialType = SPECIAL_TYPES[request.type];
    if (specialType === undefined) throw posix('EINVAL', 'Only special files are made here.');
    const device = specialType === 'char' || specialType === 'block';
    const item = recordNew(this.env.change, scope.caller, {
      draft: specialDraft(this.newItem(scope, prepared, nowNs(this.env.change))),
      identity: NO_IDENTITY,
      inode: {
        specialType,
        rdev: device ? request.rdev : undefined,
        mode: request.mode,
        uid: request.uid,
        gid: request.gid,
      },
    });
    return this.entryOf(scope, item.id, prepared.parent);
  }

  async symlink(scope: PosixScope, request: RequestMeta<'SYMLINK'>): Promise<Entry> {
    const prepared = await this.prepareFree(scope, request.parent, request.name);
    const path = await locate(this.nodes.root(scope), prepared.relPath);
    await symlink(request.target, path);
    try {
      const stamp = await this.env.change.files.stamp(path);
      if (stamp === null) throw posix('EIO', 'The new link is missing after it was made.');
      const item = recordNew(this.env.change, scope.caller, {
        draft: linkDraft(this.newItem(scope, prepared, stamp.mtimeNs), request.target),
        identity: identityOf(stamp),
        inode: { mode: SYMLINK_MODE, uid: request.uid, gid: request.gid, mtimeNs: stamp.mtimeNs },
      });
      return await this.entryOf(scope, item.id, prepared.parent);
    } catch (cause) {
      await unlink(path);
      throw cause;
    }
  }

  async tmpfile(scope: PosixScope, request: RequestMeta<'TMPFILE'>): Promise<Entry> {
    const parent = this.nodes.directory(scope, request.parent);
    this.nodes.writable(parent);
    const inodes = this.env.change.store.driveInodes;
    const inode = this.env.change.store.write((): DriveInode => {
      const created = inodes.create({
        rootId: scope.drive.id,
        type: 'file',
        mode: request.mode,
        uid: request.uid,
        gid: request.gid,
      });
      inodes.setOrphan(created.id, true);
      return created;
    });
    const path = await locate(this.nodes.root(scope), orphanRelPath(inode.id));
    await this.env.change.files.mkdir(dirname(path));
    await this.env.change.files.stage(path, Readable.from([]));
    return { ino: inode.id, attr: await this.reads.attr(scope, this.nodes.node(scope, inode.id)) };
  }
}
