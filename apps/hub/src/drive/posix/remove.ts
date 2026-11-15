import { appendFeed, announce } from '../changes';
import { moveWithin, orphanRelPath } from '../intents';
import { dropOrphan, holdOrphan } from '../orphans';
import { stageTrash, type StagedTrash } from '../trash-purge';
import { posix } from './errors';
import { actorOf, touchChange, touchDirectory } from './records';
import type { PosixEnv, PosixScope } from './env';
import type { PosixChild, PosixNodes } from './nodes';

export class PosixRemove {
  constructor(
    private readonly env: PosixEnv,
    private readonly nodes: PosixNodes,
  ) {}

  async unlink(scope: PosixScope, request: { parent: number; name: string }): Promise<void> {
    const parent = this.nodes.directory(scope, request.parent);
    this.nodes.writable(parent);
    const child = this.nodes.childOf(scope, parent, request.name);
    if (child === undefined) throw posix('ENOENT', `${request.name} does not exist.`);
    if (child.inode.type === 'dir') throw posix('EISDIR', `${request.name} is a folder.`);
    await this.drop(scope, child);
    touchDirectory(this.env.change, parent);
  }

  async rmdir(scope: PosixScope, request: { parent: number; name: string }): Promise<void> {
    const parent = this.nodes.directory(scope, request.parent);
    this.nodes.writable(parent);
    const child = this.nodes.childOf(scope, parent, request.name);
    if (child === undefined) throw posix('ENOENT', `${request.name} does not exist.`);
    if (child.inode.type !== 'dir') throw posix('ENOTDIR', `${request.name} is not a folder.`);
    this.requireEmpty(scope, child);
    await this.drop(scope, child);
    touchDirectory(this.env.change, parent);
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

  async stage(scope: PosixScope, child: PosixChild): Promise<StagedTrash> {
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
    const staged = await stageTrash(
      change,
      this.nodes.root(scope),
      child.item.id,
      actorOf(scope.caller),
    );
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
