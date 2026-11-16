import { symlink, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { INODE_TYPES, type RequestMeta } from '@smarteverything/domain/drive-mount';
import type { DriveInode } from '../../store/repositories/drive-inodes';
import type { SpecialInodeType } from '../../store/repositories/drive-item-inodes';
import { folderDraft, identityOf, isoOf, prepareContent, type NewItem } from '../changes';
import { abandonIntent, diskModeOf, locate, orphanRelPath } from '../intents';
import { stageContent } from '../stage-empty';
import type { StagedBytes } from '../versions';
import { NameBatches, reserve, type BatchSlot, type Landed } from './name-batches';
import { linkDraft, NO_IDENTITY, specialDraft } from './drafts';
import { posix } from './errors';
import { checkName, checkNewPath } from './names';
import { actorOf, recordNew, touchDirectory } from './records';
import { nowNs, stampDiskTimes } from './times';
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

interface StagedCreate {
  readonly request: RequestMeta<'CREATE'>;
  readonly staged: StagedBytes;
  readonly atimeNs: bigint;
}

export class PosixCreate {
  private readonly batches: NameBatches<Entry>;

  constructor(
    private readonly env: PosixEnv,
    private readonly nodes: PosixNodes,
    private readonly reads: PosixReads,
  ) {
    this.batches = new NameBatches({
      lanes: env.lanes,
      files: env.change.files,
      write: <R>(work: () => R): R => env.change.store.write(work),
      settled: (): void => {
        env.change.purge.rearm();
      },
      log: env.change.log,
    });
  }

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

  private unused(ino: number): void {
    if (this.env.change.store.driveInodes.find(ino) !== undefined) {
      throw posix('EEXIST', `The inode ${String(ino)} is already in use.`);
    }
  }

  async mkdir(scope: PosixScope, request: RequestMeta<'MKDIR'>): Promise<Entry> {
    const prepared = await this.prepareFree(scope, request.parent, request.name);
    this.unused(request.ino);
    const { files } = this.env.change;
    const path = await locate(this.nodes.root(scope), prepared.relPath);
    await files.mkdir(path);
    await files.chmod(path, diskModeOf(request.mode & PERMISSION_BITS, true));
    await stampDiskTimes(path, request.mtimeNs, request.mtimeNs);
    const stamp = await files.stamp(path);
    if (stamp === null) throw posix('EIO', 'The new folder is missing after it was made.');
    const item = recordNew(this.env.change, scope.caller, {
      draft: folderDraft(this.newItem(scope, prepared, stamp.mtimeNs), 0),
      identity: identityOf(stamp),
      inode: {
        id: request.ino,
        mode: request.mode,
        uid: request.uid,
        gid: request.gid,
        atimeNs: request.mtimeNs,
        mtimeNs: request.mtimeNs,
      },
    });
    return this.entryOf(scope, item.id, prepared.parent);
  }

  async create(
    scope: PosixScope,
    request: RequestMeta<'CREATE'>,
    content: Uint8Array,
  ): Promise<Entry> {
    checkName(request.name);
    const root = this.nodes.root(scope);
    const staged = await stageContent(this.env.change, root, content);
    const atimeNs = request.atimeNs ?? request.mtimeNs;
    try {
      await stampDiskTimes(await locate(root, staged.relPath), atimeNs, request.mtimeNs);
      return await this.batches.add(scope.drive.id, (slot) =>
        this.land(scope, { request, staged, atimeNs }, slot),
      );
    } catch (cause) {
      await this.env.change.files.remove(await locate(root, staged.relPath));
      throw cause;
    }
  }

  private async land(
    scope: PosixScope,
    made: StagedCreate,
    slot: BatchSlot,
  ): Promise<Landed<Entry>> {
    const { request, staged, atimeNs } = made;
    const prepared = await this.prepareFree(scope, request.parent, request.name);
    this.unused(request.ino);
    reserve(slot, prepared.relPath, `ino:${String(request.ino)}`);
    const root = this.nodes.root(scope);
    const content = await prepareContent(
      this.env.change,
      {
        root,
        staged,
        relPath: prepared.relPath,
        actor: actorOf(scope.caller),
        mode: request.mode & PERMISSION_BITS,
        inode: {
          id: request.ino,
          mode: request.mode,
          uid: request.uid,
          gid: request.gid,
          atimeNs,
          mtimeNs: request.mtimeNs,
        },
      },
      slot.barrier.directories,
    );
    let itemId: string | null = null;
    return {
      settle: (): void => {
        itemId = content.settle().item.id;
        touchDirectory(this.env.change, prepared.parent);
      },
      abandon: (): Promise<void> => abandonIntent(this.env.change, root, content.committed.intent),
      reply: async (): Promise<Entry> => {
        if (itemId === null) throw posix('EIO', `${request.name} was never recorded.`);
        const inode = this.env.change.store.driveInodes.ofItem(itemId);
        if (inode === undefined) throw posix('EIO', `The item ${itemId} has no inode.`);
        const attr = await this.reads.attr(scope, this.nodes.node(scope, inode.id));
        return { ino: inode.id, attr };
      },
    };
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
    await this.env.change.files.stageEmpty(path);
    return { ino: inode.id, attr: await this.reads.attr(scope, this.nodes.node(scope, inode.id)) };
  }
}
