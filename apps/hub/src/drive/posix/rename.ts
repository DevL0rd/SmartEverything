import { RENAME_FLAGS, type RequestMeta } from '@smarteverything/domain/drive-mount';
import { posix } from './errors';
import { checkName, checkNewPath } from './names';
import { touchDirectory } from './records';
import { writeDriveOps } from '../units/ops';
import { RenameMoves, requireNotInside, type Destination } from './rename-moves';
import type { PosixEnv, PosixScope } from './env';
import type { PosixChild, PosixNode } from '../units/posix';
import type { PosixNodes } from './nodes';
import type { PosixRemove } from './remove';

export type RenameRequest = RequestMeta<'RENAME'>;

interface Resolved {
  readonly from: PosixNode;
  readonly to: PosixNode;
  readonly source: PosixChild;
  readonly target: PosixChild | undefined;
  readonly destination: Destination;
}

function flagsOf(flags: number): { readonly exchange: boolean; readonly noReplace: boolean } {
  const exchange = (flags & RENAME_FLAGS.exchange) !== 0;
  const noReplace = (flags & RENAME_FLAGS.noReplace) !== 0;
  if ((flags & RENAME_FLAGS.whiteout) !== 0 || (exchange && noReplace)) {
    throw posix('EINVAL', 'These rename flags cannot be used.');
  }
  return { exchange, noReplace };
}

export class PosixRename {
  private readonly moves: RenameMoves;

  constructor(
    private readonly env: PosixEnv,
    private readonly nodes: PosixNodes,
    private readonly remove: PosixRemove,
  ) {
    this.moves = new RenameMoves(env, nodes);
  }

  private async resolve(scope: PosixScope, request: RenameRequest): Promise<Resolved> {
    checkName(request.name);
    checkName(request.newName);
    const named = await this.nodes.childIn(scope, request.parent, request.name, true);
    const renamed = await this.nodes.childIn(scope, request.newParent, request.newName, true);
    const { parent: from, child: source } = named;
    const { parent: to, child: target } = renamed;
    this.nodes.writable(from);
    this.nodes.writable(to);
    if (source === undefined) throw posix('ENOENT', `${request.name} does not exist.`);
    const relPath = this.nodes.relPathOf(to, request.newName);
    checkNewPath(relPath);
    return { from, to, source, target, destination: { parent: to, relPath } };
  }

  async rename(scope: PosixScope, request: RenameRequest): Promise<void> {
    const { exchange, noReplace } = flagsOf(request.flags);
    const resolved = await this.resolve(scope, request);
    const { source, target } = resolved;
    if (source.inode.id === target?.inode.id) return;
    if (source.inode.type === 'dir') requireNotInside(source, resolved.to);
    if (exchange) {
      await this.exchange(scope, resolved);
      return;
    }
    if (target !== undefined && noReplace)
      throw posix('EEXIST', `${request.newName} already exists.`);
    await this.place(scope, resolved);
    const touches = [touchDirectory(this.env.change, resolved.from)];
    if (resolved.to.inode.id !== resolved.from.inode.id)
      touches.push(touchDirectory(this.env.change, resolved.to));
    await writeDriveOps(this.env.change.store, touches);
  }

  private async exchange(scope: PosixScope, resolved: Resolved): Promise<void> {
    const { source, target } = resolved;
    if (target === undefined) throw posix('ENOENT', 'Both names must exist to be exchanged.');
    if (target.inode.type === 'dir') requireNotInside(target, resolved.from);
    await this.moves.exchange(scope, { source, target }, resolved);
  }

  private async place(scope: PosixScope, resolved: Resolved): Promise<void> {
    const { source, target, destination } = resolved;
    if (target === undefined) {
      await this.moves.move(scope, source, destination);
      return;
    }
    const directory = source.inode.type === 'dir';
    if (directory && target.inode.type !== 'dir')
      throw posix('ENOTDIR', 'A folder cannot replace a file.');
    if (!directory && target.inode.type === 'dir')
      throw posix('EISDIR', 'A file cannot replace a folder.');
    if (directory) await this.remove.requireEmpty(scope, target);
    if (await this.replaceable(source, target)) {
      await this.moves.replace(scope, source, target);
      return;
    }
    const dropped = await this.remove.stage(scope, target);
    try {
      await this.moves.move(scope, source, destination, dropped.ops);
    } catch (cause) {
      await dropped.undo();
      throw cause;
    }
  }

  private async replaceable(source: PosixChild, target: PosixChild): Promise<boolean> {
    if (source.inode.type !== 'file' || target.inode.type !== 'file') return false;
    if (this.env.holds(target.inode.id)) return false;
    const { host } = this.env.change.store;
    return (
      (await host.call('driveInodes', 'names', source.inode.id)).length === 1 &&
      (await host.call('driveInodes', 'names', target.inode.id)).length === 1
    );
  }
}
