import type { DriveFeedOp, DriveItem } from '@smarteverything/domain';
import type { DriveItemIdentity } from '../store/repositories/drive-items';
import { announce, appendFeed, type ChangeActor, type ChangeEnv } from './changes';
import { DriveWriteError } from './intents';
import { DRIVE_PAGE_SIZE } from './service-read';

export interface RepathTarget {
  readonly parentId: string | null;
  readonly relPath: string;
  readonly name: string;
}

export type RepathOp = Extract<DriveFeedOp, 'rename' | 'move'>;

export interface RepathChange {
  readonly op: RepathOp;
  readonly actor: ChangeActor;
}

interface Repath extends RepathChange {
  readonly env: ChangeEnv;
}

function identityOrRefuse(identity: DriveItemIdentity | null): DriveItemIdentity {
  if (identity === null) {
    throw new DriveWriteError('missing', 'The item is not indexed yet; scan its folder first.');
  }
  return identity;
}

function rewrite(
  { env, op, actor }: Repath,
  item: DriveItem,
  identity: DriveItemIdentity | null,
  target: RepathTarget,
): void {
  const written = env.store.driveItems.write({
    item: { ...item, parentId: target.parentId, relPath: target.relPath, name: target.name },
    identity: identityOrRefuse(identity),
  });
  if (written.changed) {
    appendFeed(env, written.item, op, actor);
  }
}

function repathChildren(context: Repath, folder: DriveItem, folderRelPath: string): void {
  const { env } = context;
  let after: string | null = null;
  do {
    const window = env.store.driveItems.children({
      rootId: folder.rootId,
      parentId: folder.id,
      after,
      limit: DRIVE_PAGE_SIZE,
      viewer: null,
    });
    for (const entry of window.entries) {
      const relPath = `${folderRelPath}/${entry.item.name}`;
      const target = { parentId: folder.id, relPath, name: entry.item.name };
      rewrite(context, entry.item, entry.identity, target);
      if (entry.item.kind === 'folder') {
        repathChildren(context, entry.item, relPath);
      }
    }
    after = window.next;
  } while (after !== null);
}

export function repathItem(
  env: ChangeEnv,
  item: DriveItem,
  target: RepathTarget,
  change: RepathChange,
): void {
  const context = { env, ...change };
  env.store.write(() => {
    rewrite(context, item, env.store.driveItems.identityOf(item.id), target);
    if (item.kind === 'folder') {
      repathChildren(context, item, target.relPath);
    }
  });
  announce(env, item.rootId, item.parentId, [item]);
  if (target.parentId !== item.parentId) {
    announce(env, item.rootId, target.parentId, [item]);
  }
}
