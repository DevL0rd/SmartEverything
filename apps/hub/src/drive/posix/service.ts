import type { Attr, ReplyMeta, RequestMeta } from '@smarteverything/domain/drive-mount';
import { posix, guarded } from './errors';
import { PosixCreate } from './create';
import { PosixLink } from './link';
import { PosixNodes } from './nodes';
import { PosixOpen, type OpenTarget } from './open';
import { PosixReads, type DirectoryPage, type Entry } from './reads';
import { PosixRemove } from './remove';
import { PosixRename, type RenameRequest } from './rename';
import { PosixSetattr, type SetattrRequest, type WrittenTimes } from './setattr';
import { statfsOf, type StatfsReply } from './statfs';
import { PosixXattrs } from './xattr';
import { PosixScope, type PosixCaller, type PosixEnv } from './env';

export interface Attached {
  readonly scope: PosixScope;
  readonly root: string;
  readonly ino: number;
  readonly attr: Attr;
  readonly seq: number;
}

export class DrivePosix {
  private readonly nodes: PosixNodes;
  private readonly reads: PosixReads;
  private readonly setattrs: PosixSetattr;
  private readonly creates: PosixCreate;
  private readonly links: PosixLink;
  private readonly removes: PosixRemove;
  private readonly renames: PosixRename;
  private readonly xattrs: PosixXattrs;
  private readonly opens: PosixOpen;

  constructor(private readonly env: PosixEnv) {
    this.nodes = new PosixNodes(env);
    this.reads = new PosixReads(env, this.nodes);
    this.setattrs = new PosixSetattr(env, this.nodes, this.reads);
    this.creates = new PosixCreate(env, this.nodes, this.reads);
    this.links = new PosixLink(env, this.nodes, this.reads);
    this.removes = new PosixRemove(env, this.nodes);
    this.renames = new PosixRename(env, this.nodes, this.removes);
    this.xattrs = new PosixXattrs(env, this.nodes);
    this.opens = new PosixOpen(env, this.nodes);
  }

  attach(caller: PosixCaller, placementId: string): Promise<Attached> {
    return guarded(async () => {
      const { host } = this.env.change.store;
      const placement = await host.call('drivePlacements', 'find', placementId);
      if (placement?.mode !== 'mounted' || placement.deviceId !== caller.nodeId) {
        throw posix('EACCES', 'This computer has no mount of that drive or folder.');
      }
      const drive = await this.env.space.read.rootFor(caller, placement.rootId);
      const base =
        placement.folderItemId === null
          ? null
          : (await this.env.space.read.readItemAndRoot(caller, placement.folderItemId)).item;
      const rootInode =
        base === null
          ? await host.call('driveInodes', 'rootOf', drive.id)
          : await host.call('driveInodes', 'ofItem', base.id);
      if (rootInode === undefined) throw posix('EIO', 'The mounted folder has no inode.');
      const scope = new PosixScope(caller, placementId, {
        drive,
        baseId: base?.id ?? null,
        rootInode: rootInode.id,
      });
      return {
        scope,
        root: drive.id,
        ino: rootInode.id,
        attr: await this.reads.getattr(scope, rootInode.id),
        seq: await host.call('driveFeed', 'latestSeqInRoot', drive.id),
      };
    });
  }

  private mutate<T>(rootId: string, operation: () => Promise<T> | T): Promise<T> {
    return this.env.lanes.run([rootId], () => guarded(operation));
  }

  lane<T>(rootId: string, operation: () => Promise<T>): Promise<T> {
    return this.mutate(rootId, operation);
  }

  landing<T>(rootId: string, ino: number, operation: () => Promise<T>): Promise<T> {
    return this.env.lanes.shared(rootId, ino, () => guarded(operation));
  }

  lookup(scope: PosixScope, request: RequestMeta<'LOOKUP'>): Promise<Entry> {
    return guarded(() => this.reads.lookup(scope, request));
  }

  getattr(scope: PosixScope, ino: number): Promise<Attr> {
    return guarded(() => this.reads.getattr(scope, ino));
  }

  readdir(scope: PosixScope, request: RequestMeta<'READDIR'>): Promise<DirectoryPage> {
    return guarded(() => this.reads.readdir(scope, request));
  }

  readlink(scope: PosixScope, ino: number): Promise<string> {
    return guarded(() => this.reads.readlink(scope, ino));
  }

  setattr(scope: PosixScope, request: SetattrRequest): Promise<Attr> {
    return this.mutate(scope.drive.id, () => this.setattrs.setattr(scope, request));
  }

  statfs(scope: PosixScope, ino: number): Promise<StatfsReply> {
    return guarded(() => statfsOf(this.env, this.nodes, scope, ino));
  }

  mkdir(scope: PosixScope, request: RequestMeta<'MKDIR'>): Promise<Entry> {
    return guarded(() => this.creates.mkdir(scope, request));
  }

  create(scope: PosixScope, request: RequestMeta<'CREATE'>, content: Uint8Array): Promise<Entry> {
    return guarded(() => this.creates.create(scope, request, content));
  }

  mknod(scope: PosixScope, request: RequestMeta<'MKNOD'>): Promise<Entry> {
    return this.mutate(scope.drive.id, () => this.creates.mknod(scope, request));
  }

  symlink(scope: PosixScope, request: RequestMeta<'SYMLINK'>): Promise<Entry> {
    return this.mutate(scope.drive.id, () => this.creates.symlink(scope, request));
  }

  tmpfile(scope: PosixScope, request: RequestMeta<'TMPFILE'>): Promise<Entry> {
    return this.mutate(scope.drive.id, () => this.creates.tmpfile(scope, request));
  }

  link(scope: PosixScope, request: RequestMeta<'LINK'>): Promise<Attr> {
    return this.mutate(scope.drive.id, () => this.links.link(scope, request));
  }

  unlink(scope: PosixScope, request: RequestMeta<'UNLINK'>): Promise<void> {
    return guarded(() => this.removes.unlink(scope, request));
  }

  rmdir(scope: PosixScope, request: RequestMeta<'RMDIR'>): Promise<void> {
    return this.mutate(scope.drive.id, () => this.removes.rmdir(scope, request));
  }

  rmtree(scope: PosixScope, request: RequestMeta<'RMTREE'>): Promise<void> {
    return this.mutate(scope.drive.id, () => this.removes.rmtree(scope, request));
  }

  rename(scope: PosixScope, request: RenameRequest): Promise<void> {
    return this.mutate(scope.drive.id, () => this.renames.rename(scope, request));
  }

  releaseOrphan(rootId: string, inodeId: number): Promise<boolean> {
    return this.mutate(rootId, () => this.removes.releaseOrphan(rootId, inodeId));
  }

  getxattr(scope: PosixScope, request: RequestMeta<'GETXATTR'>): Promise<Uint8Array> {
    return guarded(() => this.xattrs.get(scope, request));
  }

  setxattr(scope: PosixScope, request: RequestMeta<'SETXATTR'>, value: Uint8Array): Promise<void> {
    return this.mutate(scope.drive.id, () => this.xattrs.set(scope, request, value));
  }

  listxattr(scope: PosixScope, ino: number): Promise<ReplyMeta<'LISTXATTR'>> {
    return guarded(async () => ({ names: await this.xattrs.list(scope, ino) }));
  }

  removexattr(scope: PosixScope, request: RequestMeta<'REMOVEXATTR'>): Promise<void> {
    return this.mutate(scope.drive.id, () => this.xattrs.remove(scope, request));
  }

  openTarget(scope: PosixScope, ino: number, write: boolean): Promise<OpenTarget> {
    return guarded(() => this.opens.target(scope, ino, write));
  }

  access(scope: PosixScope, request: RequestMeta<'ACCESS'>): Promise<Attr> {
    return this.mutate(scope.drive.id, async () => {
      await this.opens.access(scope, request);
      return this.reads.getattr(scope, request.ino);
    });
  }

  stampWrite(scope: PosixScope, ino: number, written: WrittenTimes): Promise<void> {
    return guarded(() => this.setattrs.stampWrite(scope, ino, written));
  }
}
