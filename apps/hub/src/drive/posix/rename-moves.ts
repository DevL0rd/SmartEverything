import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { commitContent } from '../changes';
import { exchangeWithin, settleExchange } from '../exchange';
import { moveWithin, TMP_DIRECTORY } from '../intents';
import { writeDriveOps, type DriveOp } from '../units/ops';
import { stageInPlace } from '../versions';
import { posix } from './errors';
import { actorOf, touchChange, touchDirectory } from './records';
import { after, nowNs } from './times';
import type { PosixEnv, PosixScope } from './env';
import type { PosixChild, PosixNode } from '../units/posix';
import type { PosixNodes } from './nodes';

export interface Destination {
  readonly parent: PosixNode;
  readonly relPath: string;
}

export class RenameMoves {
  constructor(
    private readonly env: PosixEnv,
    private readonly nodes: PosixNodes,
  ) {}

  async move(
    scope: PosixScope,
    source: PosixChild,
    destination: Destination,
    alongside: readonly DriveOp[] = [],
  ): Promise<void> {
    const { change } = this.env;
    const root = await this.nodes.root(scope);
    const { item } = source;
    const onDisk = item.kind !== 'special';
    if (onDisk) {
      await moveWithin(change.files, root, {
        from: item.relPath,
        to: destination.relPath,
        mode: 'keep',
      });
    }
    const parentId = destination.parent.item?.id ?? null;
    try {
      await writeDriveOps(change.store, [
        ...alongside,
        {
          kind: 'repath',
          itemId: item.id,
          target: { parentId, relPath: destination.relPath, name: basename(destination.relPath) },
          change: {
            op: parentId === item.parentId ? 'rename' : 'move',
            actor: actorOf(scope.caller),
          },
        },
        touchChange(change, source),
      ]);
    } catch (cause) {
      if (onDisk) {
        await moveWithin(change.files, root, {
          from: destination.relPath,
          to: item.relPath,
          mode: 'keep',
        });
      }
      throw cause;
    }
  }

  async replace(scope: PosixScope, source: PosixChild, target: PosixChild): Promise<void> {
    const { change } = this.env;
    const root = await this.nodes.root(scope);
    const staged = await stageInPlace(change, root, source.item.relPath);
    await commitContent(change, {
      root,
      staged,
      relPath: target.item.relPath,
      actor: actorOf(scope.caller),
      mode: source.inode.mode & 0o777,
      alongside: [
        {
          kind: 'adoptInode',
          sourceInodeId: source.inode.id,
          sourceItemId: source.item.id,
          targetInodeId: target.inode.id,
          attributes: { mode: source.inode.mode, uid: source.inode.uid, gid: source.inode.gid },
          times: {
            atimeNs: source.inode.atimeNs,
            ctimeNs: after(target.inode.ctimeNs, nowNs(change)),
          },
        },
      ],
    });
  }

  async exchange(
    scope: PosixScope,
    pair: { readonly source: PosixChild; readonly target: PosixChild },
    parents: { readonly from: PosixNode; readonly to: PosixNode },
  ): Promise<void> {
    const { change } = this.env;
    const root = await this.nodes.root(scope);
    const { source, target } = pair;
    const intent = await exchangeWithin(change, root, {
      a: source.item.relPath,
      b: target.item.relPath,
    });
    await writeDriveOps(change.store, this.swapRows(scope, pair, parents));
    await settleExchange(change, root, intent);
    const touches = [
      touchChange(change, source),
      touchChange(change, target),
      touchDirectory(change, parents.from),
    ];
    if (parents.to.inode.id !== parents.from.inode.id)
      touches.push(touchDirectory(change, parents.to));
    await writeDriveOps(change.store, [{ kind: 'clearIntent', intentId: intent.id }, ...touches]);
  }

  private swapRows(
    scope: PosixScope,
    pair: { readonly source: PosixChild; readonly target: PosixChild },
    parents: { readonly from: PosixNode; readonly to: PosixNode },
  ): DriveOp[] {
    const { source, target } = pair;
    const change = { op: 'rename', actor: actorOf(scope.caller) } as const;
    const holding = {
      parentId: null,
      relPath: `${TMP_DIRECTORY}/exchange-${randomUUID()}`,
      name: 'exchange',
    };
    return [
      { kind: 'repath', itemId: source.item.id, target: holding, change },
      {
        kind: 'repath',
        itemId: target.item.id,
        target: {
          parentId: parents.from.item?.id ?? null,
          relPath: source.item.relPath,
          name: source.item.name,
        },
        change,
      },
      {
        kind: 'repath',
        itemId: source.item.id,
        target: {
          parentId: parents.to.item?.id ?? null,
          relPath: target.item.relPath,
          name: target.item.name,
        },
        change,
      },
    ];
  }
}

export function requireNotInside(source: PosixChild, destination: PosixNode): void {
  const inside =
    destination.item !== null &&
    (destination.item.id === source.item.id ||
      destination.item.relPath.startsWith(`${source.item.relPath}/`));
  if (inside) throw posix('EINVAL', 'A folder cannot move into itself.');
}
