import { symlink, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { INODE_TYPES, type RequestMeta } from '@smarteverything/domain/drive-mount';
import type { DriveItem } from '@smarteverything/domain';
import type { DriveInode } from '../../store/repositories/drive-inodes';
import type { SpecialInodeType } from '../../store/repositories/drive-item-inodes';
import { folderDraft, identityOf, isoOf, prepareContent, type NewItem } from '../changes';
import { abandonIntent, diskModeOf, locate, orphanRelPath, type FileStamp } from '../intents';
import { stageContent } from '../stage-empty';
import type { StagedBytes } from '../versions';
import { NameBatches, reserve, type BatchSlot, type Landed } from './name-batches';
import { attrOf, sizeOf } from './attr';
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

const FRESH_FOLDER_LINKS = 2;

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
      claim: (claim): void => {
        env.change.store.driveSyncOps.claim(claim);
      },
      touch: (folders): void => {
        for (const folder of folders) touchDirectory(env.change, folder);
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

  private folderIn(scope: PosixScope, parentIno: number, slot: BatchSlot): PosixNode {
    let known = slot.folders.get(scope);
    if (known === undefined) {
      known = new Map();
      slot.folders.set(scope, known);
    }
    const cached = known.get(parentIno);
    if (cached !== undefined) return cached;
    const parent = this.nodes.directory(scope, parentIno);
    known.set(parentIno, parent);
    return parent;
  }

  private async prepareIn(
    scope: PosixScope,
    target: { readonly parent: number; readonly name: string },
    slot: BatchSlot,
  ): Promise<Prepared> {
    checkName(target.name);
    const parent = this.folderIn(scope, target.parent, slot);
    this.nodes.writable(parent);
    const relPath = this.nodes.relPathOf(parent, target.name);
    checkNewPath(relPath);
    if (this.env.change.store.driveItems.lookups.placed(scope.drive.id, relPath) !== undefined) {
      throw posix('EEXIST', `${target.name} already exists.`);
    }
    const path = await locate(this.nodes.root(scope), relPath);
    if ((await this.env.change.files.stamp(path)) !== null) {
      throw posix('EEXIST', `${target.name} is already on disk.`);
    }
    return { parent, relPath, existing: undefined };
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

  private entryOf(item: DriveItem, parent: PosixNode): Entry {
    touchDirectory(this.env.change, parent);
    return this.settledEntry(item);
  }

  private unused(ino: number): void {
    if (this.env.change.store.driveInodes.find(ino) !== undefined) {
      throw posix('EINVAL', `The inode ${String(ino)} is already in use.`);
    }
  }

  mkdir(scope: PosixScope, request: RequestMeta<'MKDIR'>): Promise<Entry> {
    return this.batches.add(scope.drive.id, (slot) => this.landFolder(scope, request, slot));
  }

  private async landFolder(
    scope: PosixScope,
    request: RequestMeta<'MKDIR'>,
    slot: BatchSlot,
  ): Promise<Landed<Entry>> {
    const prepared = await this.prepareIn(scope, request, slot);
    this.unused(request.ino);
    reserve(slot, prepared.relPath, `ino:${String(request.ino)}`);
    const { files } = this.env.change;
    const path = await locate(this.nodes.root(scope), prepared.relPath);
    await files.mkdir(path);
    let stamp: FileStamp | null;
    try {
      await files.chmod(path, diskModeOf(request.mode & PERMISSION_BITS, true));
      await stampDiskTimes(path, request.mtimeNs, request.mtimeNs);
      stamp = await files.stamp(path);
      if (stamp === null) throw posix('EIO', 'The new folder is missing after it was made.');
    } catch (cause) {
      await files.remove(path);
      throw cause;
    }
    slot.barrier.directories.add(dirname(path));
    const made = stamp;
    let entry: Entry | null = null;
    return {
      settle: (): void => {
        const item = recordNew(this.env.change, scope.caller, {
          draft: folderDraft(this.newItem(scope, prepared, made.mtimeNs), 0),
          identity: identityOf(made),
          inode: {
            id: request.ino,
            mode: request.mode,
            uid: request.uid,
            gid: request.gid,
            atimeNs: request.mtimeNs,
            mtimeNs: request.mtimeNs,
          },
        });
        slot.touched.set(prepared.parent.inode.id, prepared.parent);
        entry = this.settledEntry(item, request.ino);
      },
      abandon: (): Promise<void> => files.remove(path),
      reply: (): Promise<Entry> => this.recorded(request.name, entry),
    };
  }

  private settledEntry(item: DriveItem, fresh?: number): Entry {
    const inodes = this.env.change.store.driveInodes;
    const inode = inodes.ofItem(item.id);
    if (inode === undefined) throw posix('EIO', `The item ${item.id} has no inode.`);
    const nlink =
      inode.id === fresh && inode.type !== 'dir'
        ? 1
        : inode.id === fresh
          ? FRESH_FOLDER_LINKS
          : inodes.linkCount(inode.id);
    return { ino: inode.id, attr: attrOf({ inode, item, nlink, size: sizeOf(inode, item) }) };
  }

  private recorded(name: string, entry: Entry | null): Promise<Entry> {
    if (entry === null) return Promise.reject(posix('EIO', `${name} was never recorded.`));
    return Promise.resolve(entry);
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
    const prepared = await this.prepareIn(scope, request, slot);
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
    let entry: Entry | null = null;
    return {
      settle: (): void => {
        const { item } = content.settle();
        slot.touched.set(prepared.parent.inode.id, prepared.parent);
        entry = this.settledEntry(item, request.ino);
      },
      abandon: (): Promise<void> => abandonIntent(this.env.change, root, content.committed.intent),
      reply: (): Promise<Entry> => this.recorded(request.name, entry),
    };
  }

  mknod(scope: PosixScope, request: RequestMeta<'MKNOD'>): Entry {
    const prepared = this.prepare(scope, request.parent, request.name);
    if (prepared.existing !== undefined) throw posix('EEXIST', `${request.name} already exists.`);
    const specialType = SPECIAL_TYPES[request.type];
    if (specialType === undefined) throw posix('EINVAL', 'Only special files are made here.');
    this.unused(request.ino);
    const device = specialType === 'char' || specialType === 'block';
    const item = recordNew(this.env.change, scope.caller, {
      draft: specialDraft(this.newItem(scope, prepared, nowNs(this.env.change))),
      identity: NO_IDENTITY,
      inode: {
        id: request.ino,
        specialType,
        rdev: device ? request.rdev : undefined,
        mode: request.mode,
        uid: request.uid,
        gid: request.gid,
      },
    });
    return this.entryOf(item, prepared.parent);
  }

  async symlink(scope: PosixScope, request: RequestMeta<'SYMLINK'>): Promise<Entry> {
    const prepared = await this.prepareFree(scope, request.parent, request.name);
    this.unused(request.ino);
    const path = await locate(this.nodes.root(scope), prepared.relPath);
    await symlink(request.target, path);
    try {
      const stamp = await this.env.change.files.stamp(path);
      if (stamp === null) throw posix('EIO', 'The new link is missing after it was made.');
      const item = recordNew(this.env.change, scope.caller, {
        draft: linkDraft(this.newItem(scope, prepared, stamp.mtimeNs), request.target),
        identity: identityOf(stamp),
        inode: {
          id: request.ino,
          mode: SYMLINK_MODE,
          uid: request.uid,
          gid: request.gid,
          mtimeNs: stamp.mtimeNs,
        },
      });
      return this.entryOf(item, prepared.parent);
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
