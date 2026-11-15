import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { commitContent } from '../changes';
import { exchangeWithin, settleExchange } from '../exchange';
import { moveWithin, TMP_DIRECTORY } from '../intents';
import { repathItem } from '../service-write-repath';
import { stageInPlace } from '../versions';
import { posix } from './errors';
import { actorOf, touchChange, touchDirectory } from './records';
import { after, nowNs } from './times';
import type { PosixEnv, PosixScope } from './env';
import type { PosixChild, PosixNode, PosixNodes } from './nodes';

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
    alongside?: () => void,
  ): Promise<void> {
    const { change } = this.env;
    const root = this.nodes.root(scope);
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
      change.store.write(() => {
        alongside?.();
        repathItem(
          change,
          item,
          { parentId, relPath: destination.relPath, name: basename(destination.relPath) },
          { op: parentId === item.parentId ? 'rename' : 'move', actor: actorOf(scope.caller) },
        );
      });
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
    touchChange(change, source);
  }

  async replace(scope: PosixScope, source: PosixChild, target: PosixChild): Promise<void> {
    const { change } = this.env;
    const root = this.nodes.root(scope);
    const staged = await stageInPlace(change, root, source.item.relPath);
    await commitContent(change, {
      root,
      staged,
      relPath: target.item.relPath,
      actor: actorOf(scope.caller),
      mode: source.inode.mode & 0o777,
      alongside: (): void => {
        this.adopt(source, target);
      },
    });
  }

  private adopt(source: PosixChild, target: PosixChild): void {
    const { store } = this.env.change;
    store.driveInodes.setAttributes(target.inode.id, {
      mode: source.inode.mode,
      uid: source.inode.uid,
      gid: source.inode.gid,
    });
    for (const name of store.driveXattrs.names(target.inode.id)) {
      store.driveXattrs.remove(target.inode.id, name);
    }
    store.driveXattrs.copy(source.inode.id, target.inode.id);
    store.driveInodes.setTimes(target.inode.id, {
      atimeNs: source.inode.atimeNs,
      ctimeNs: after(target.inode.ctimeNs, nowNs(this.env.change)),
    });
    store.driveItems.remove(source.item.id);
  }

  async exchange(
    scope: PosixScope,
    pair: { readonly source: PosixChild; readonly target: PosixChild },
    parents: { readonly from: PosixNode; readonly to: PosixNode },
  ): Promise<void> {
    const { change } = this.env;
    const root = this.nodes.root(scope);
    const { source, target } = pair;
    const intent = await exchangeWithin(change, root, {
      a: source.item.relPath,
      b: target.item.relPath,
    });
    change.store.write(() => {
      this.swapRows(scope, pair, parents);
    });
    await settleExchange(change, root, intent);
    change.store.driveIntents.clear(intent.id);
    touchChange(change, source);
    touchChange(change, target);
    touchDirectory(change, parents.from);
    if (parents.to.inode.id !== parents.from.inode.id) touchDirectory(change, parents.to);
  }

  private swapRows(
    scope: PosixScope,
    pair: { readonly source: PosixChild; readonly target: PosixChild },
    parents: { readonly from: PosixNode; readonly to: PosixNode },
  ): void {
    const { change } = this.env;
    const { source, target } = pair;
    const actor = { op: 'rename', actor: actorOf(scope.caller) } as const;
    const holding = {
      parentId: null,
      relPath: `${TMP_DIRECTORY}/exchange-${randomUUID()}`,
      name: 'exchange',
    };
    repathItem(change, source.item, holding, actor);
    repathItem(
      change,
      change.store.driveItems.byId(target.item.id, null),
      {
        parentId: parents.from.item?.id ?? null,
        relPath: source.item.relPath,
        name: source.item.name,
      },
      actor,
    );
    repathItem(
      change,
      change.store.driveItems.byId(source.item.id, null),
      {
        parentId: parents.to.item?.id ?? null,
        relPath: target.item.relPath,
        name: target.item.name,
      },
      actor,
    );
  }
}

export function requireNotInside(source: PosixChild, destination: PosixNode): void {
  const inside =
    destination.item !== null &&
    (destination.item.id === source.item.id ||
      destination.item.relPath.startsWith(`${source.item.relPath}/`));
  if (inside) throw posix('EINVAL', 'A folder cannot move into itself.');
}
