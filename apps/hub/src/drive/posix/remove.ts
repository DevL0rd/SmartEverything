import { moveWithin, orphanRelPath } from '../intents';
import { dropOrphan, holdOrphan } from '../orphans';
import { recordStaged, stageTrash, stageTrashDeferred, type StagedTrash } from '../trash-purge';
import type { Barrier } from '../trash';
import { writeDriveOps, type DriveOp, type DriveOpResult } from '../units/ops';
import { NameBatches, reserve, type BatchSlot, type Landed } from './name-batches';
import { posix } from './errors';
import { actorOf, touchChange, touchDirectory } from './records';
import type { PosixEnv, PosixScope } from './env';
import type { PosixChild, PosixNode } from '../units/posix';
import type { PosixNodes } from './nodes';

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
      write: (ops): Promise<DriveOpResult[]> => writeDriveOps(env.change.store, ops),
      settled: (): void => {
        env.change.purge.rearm();
      },
      touch: (folders): DriveOp[] =>
        [...folders].map((folder) => touchDirectory(env.change, folder)),
      log: env.change.log,
    });
  }

  private async named(
    scope: PosixScope,
    request: NamedRemove,
  ): Promise<{ parent: PosixNode; child: PosixChild }> {
    const { parent, child } = await this.nodes.childIn(scope, request.parent, request.name);
    this.nodes.writable(parent);
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
    const { parent, child } = await this.named(scope, request);
    if (child.inode.type === 'dir') throw posix('EISDIR', `${request.name} is a folder.`);
    reserve(slot, child.item.relPath, `ino:${String(child.inode.id)}`);
    const dropped = await this.stage(scope, child, slot.barrier);
    return {
      ops: [...dropped.ops, touchDirectory(this.env.change, parent)],
      abandon: dropped.undo,
      reply: (): Promise<undefined> => Promise.resolve(undefined),
    };
  }

  async rmdir(scope: PosixScope, request: NamedRemove): Promise<void> {
    const { parent, child } = await this.named(scope, request);
    if (child.inode.type !== 'dir') throw posix('ENOTDIR', `${request.name} is not a folder.`);
    await this.requireEmpty(scope, child);
    await this.drop(scope, child, parent);
  }

  async rmtree(scope: PosixScope, request: TreeRemove): Promise<void> {
    const { parent, child } = await this.named(scope, request);
    if (child.inode.type !== 'dir') throw posix('ENOTDIR', `${request.name} is not a folder.`);
    await this.requireTree(child, request.inodes);
    await this.drop(scope, child, parent);
  }

  private async requireTree(folder: PosixChild, inodes: readonly number[]): Promise<void> {
    const below = await this.env.change.store.host.call('driveInodes', 'below', folder.item.id);
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

  async requireEmpty(scope: PosixScope, folder: PosixChild): Promise<void> {
    const children = await this.env.change.store.host.call('driveItems', 'children', {
      rootId: scope.drive.id,
      parentId: folder.item.id,
      after: null,
      limit: 1,
      viewer: null,
    });
    if (children.entries.length > 0) throw posix('ENOTEMPTY', `${folder.item.name} is not empty.`);
  }

  async drop(scope: PosixScope, child: PosixChild, parent: PosixNode): Promise<void> {
    const dropped = await this.stage(scope, child);
    await recordStaged(this.env.change, [
      { ops: [...dropped.ops, touchDirectory(this.env.change, parent)], undo: dropped.undo },
    ]);
  }

  async stage(scope: PosixScope, child: PosixChild, barrier?: Barrier): Promise<StagedTrash> {
    const { change } = this.env;
    const last = (await change.store.host.call('driveInodes', 'names', child.inode.id)).length <= 1;
    const touch: DriveOp[] = last ? [] : [touchChange(change, child)];
    if (child.item.kind === 'special') {
      return {
        ops: [{ kind: 'forget', item: child.item, actor: actorOf(scope.caller) }, ...touch],
        undo: () => Promise.resolve(),
      };
    }
    if (last && child.inode.type === 'file' && this.env.holds(child.inode.id)) {
      return this.hold(scope, child);
    }
    const root = await this.nodes.root(scope);
    const actor = actorOf(scope.caller);
    const staged =
      barrier === undefined
        ? await stageTrash(change, root, child.item.id, actor)
        : await stageTrashDeferred(change, root, { itemId: child.item.id, actor, barrier });
    return { ops: [...staged.ops, ...touch], undo: staged.undo };
  }

  private async hold(scope: PosixScope, child: PosixChild): Promise<StagedTrash> {
    const { change } = this.env;
    const root = await this.nodes.root(scope);
    await holdOrphan(change.files, root, child.item.relPath, child.inode.id);
    return {
      ops: [
        { kind: 'orphan', item: child.item, inodeId: child.inode.id, actor: actorOf(scope.caller) },
      ],
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
    const inode = await change.store.host.call('driveInodes', 'find', inodeId);
    if (inode === undefined || !inode.orphan || this.env.holds(inodeId)) return false;
    const root = await change.store.host.call('driveRoots', 'byId', rootId);
    await dropOrphan(change.files, root, inodeId);
    await writeDriveOps(change.store, [{ kind: 'removeInode', inodeId }]);
    return true;
  }
}
