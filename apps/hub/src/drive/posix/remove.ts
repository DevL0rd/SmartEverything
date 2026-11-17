import { appendFeed, announce } from '../changes';
import { moveWithin, orphanRelPath } from '../intents';
import { dropOrphan, holdOrphan } from '../orphans';
import { stageTrash, stageTrashDeferred, type StagedTrash } from '../trash-purge';
import type { Barrier } from '../trash';
import { NameBatches, reserve, type BatchSlot, type Landed } from './name-batches';
import { posix } from './errors';
import { actorOf, touchChange, touchDirectory } from './records';
import type { PosixEnv, PosixScope } from './env';
import type { PosixChild, PosixNode, PosixNodes } from './nodes';

export interface NamedRemove {
  readonly parent: number;
  readonly name: string;
  readonly ino: number;
}

export interface TreeRemove extends NamedRemove {
  readonly inodes: readonly number[];
}

export class PosixRemove {
  private readonly batches: NameBatches<undefined>;

  constructor(
    private readonly env: PosixEnv,
    private readonly nodes: PosixNodes,
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

  private named(scope: PosixScope, request: NamedRemove): { parent: PosixNode; child: PosixChild } {
    const parent = this.nodes.directory(scope, request.parent);
    this.nodes.writable(parent);
    const child = this.nodes.childOf(scope, parent, request.name);
    if (child === undefined) throw posix('ENOENT', `${request.name} does not exist.`);
    if (child.inode.id !== request.ino) {
      throw posix('ESTALE', `${request.name} now names another item than the one removed.`);
    }
    return { parent, child };
  }

  async unlink(scope: PosixScope, request: NamedRemove): Promise<void> {
    await this.batches.add(scope.drive.id, (slot) => this.landUnlink(scope, request, slot));
  }

  private async landUnlink(
    scope: PosixScope,
    request: NamedRemove,
    slot: BatchSlot,
  ): Promise<Landed<undefined>> {
    const { parent, child } = this.named(scope, request);
    if (child.inode.type === 'dir') throw posix('EISDIR', `${request.name} is a folder.`);
    reserve(slot, child.item.relPath, `ino:${String(child.inode.id)}`);
    const dropped = await this.stage(scope, child, slot.barrier);
    return {
      settle: (): void => {
        dropped.record();
        touchDirectory(this.env.change, parent);
      },
      abandon: dropped.undo,
      reply: (): Promise<undefined> => Promise.resolve(undefined),
    };
  }

  async rmdir(scope: PosixScope, request: NamedRemove): Promise<void> {
    const { parent, child } = this.named(scope, request);
    if (child.inode.type !== 'dir') throw posix('ENOTDIR', `${request.name} is not a folder.`);
    this.requireEmpty(scope, child);
    await this.drop(scope, child);
    touchDirectory(this.env.change, parent);
  }

  async rmtree(scope: PosixScope, request: TreeRemove): Promise<void> {
    const { parent, child } = this.named(scope, request);
    if (child.inode.type !== 'dir') throw posix('ENOTDIR', `${request.name} is not a folder.`);
    this.requireTree(child, request.inodes);
    await this.drop(scope, child);
    touchDirectory(this.env.change, parent);
  }

  private requireTree(folder: PosixChild, inodes: readonly number[]): void {
    const below = this.env.change.store.driveInodes.below(folder.item.id);
    const removed = new Set(inodes);
    const same =
      below.length === inodes.length &&
      removed.size === inodes.length &&
      below.every((entry) => removed.has(entry.inodeId) && entry.names === 1);
    if (!same) {
      throw posix('ESTALE', `${folder.item.name} no longer holds exactly the removed items.`);
    }
    if (below.some((entry) => this.env.holds(entry.inodeId))) {
      throw posix('ESTALE', `${folder.item.name} holds a file that is still open.`);
    }
  }

  requireEmpty(scope: PosixScope, folder: PosixChild): void {
    const children = this.env.change.store.driveItems.children({
      rootId: scope.drive.id,
      parentId: folder.item.id,
      after: null,
      limit: 1,
      viewer: null,
    });
    if (children.entries.length > 0) throw posix('ENOTEMPTY', `${folder.item.name} is not empty.`);
  }

  async drop(scope: PosixScope, child: PosixChild): Promise<void> {
    const dropped = await this.stage(scope, child);
    try {
      this.env.change.store.write(dropped.record);
    } catch (cause) {
      await dropped.undo();
      throw cause;
    }
  }

  async stage(scope: PosixScope, child: PosixChild, barrier?: Barrier): Promise<StagedTrash> {
    const { change } = this.env;
    const last = change.store.driveInodes.names(child.inode.id).length <= 1;
    const touch = (): void => {
      if (!last) touchChange(change, child);
    };
    if (child.item.kind === 'special') {
      return {
        record: (): void => {
          this.forget(scope, child);
          touch();
        },
        undo: () => Promise.resolve(),
      };
    }
    if (last && child.inode.type === 'file' && this.env.holds(child.inode.id)) {
      return this.hold(scope, child);
    }
    const root = this.nodes.root(scope);
    const actor = actorOf(scope.caller);
    const staged =
      barrier === undefined
        ? await stageTrash(change, root, child.item.id, actor)
        : await stageTrashDeferred(change, root, { itemId: child.item.id, actor, barrier });
    return {
      record: (): void => {
        staged.record();
        touch();
      },
      undo: staged.undo,
    };
  }

  private forget(scope: PosixScope, child: PosixChild): void {
    const { change } = this.env;
    appendFeed(change, { ...child.item, rev: child.item.rev + 1 }, 'delete', actorOf(scope.caller));
    change.store.driveItems.remove(child.item.id);
    announce(change, child.item.rootId, child.item.parentId, [child.item]);
  }

  private async hold(scope: PosixScope, child: PosixChild): Promise<StagedTrash> {
    const { change } = this.env;
    const root = this.nodes.root(scope);
    await holdOrphan(change.files, root, child.item.relPath, child.inode.id);
    return {
      record: (): void => {
        appendFeed(
          change,
          { ...child.item, rev: child.item.rev + 1 },
          'delete',
          actorOf(scope.caller),
        );
        change.store.driveInodes.setOrphan(child.inode.id, true);
        change.store.driveItems.remove(child.item.id);
        announce(change, child.item.rootId, child.item.parentId, [child.item]);
      },
      undo: async (): Promise<void> => {
        await moveWithin(change.files, root, {
          from: orphanRelPath(child.inode.id),
          to: child.item.relPath,
          mode: 'replace',
        });
      },
    };
  }

  async releaseOrphan(rootId: string, inodeId: number): Promise<boolean> {
    const { change } = this.env;
    const inode = change.store.driveInodes.find(inodeId);
    if (inode === undefined || !inode.orphan || this.env.holds(inodeId)) return false;
    const root = change.store.driveRoots.byId(rootId);
    await dropOrphan(change.files, root, inodeId);
    change.store.driveInodes.remove(inodeId);
    return true;
  }
}
