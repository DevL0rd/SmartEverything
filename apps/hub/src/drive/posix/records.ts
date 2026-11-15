import type { DriveFeedOp, DriveItem } from '@smarteverything/domain';
import type { DriveInodePatch } from '../../store/repositories/drive-item-inodes';
import type { DriveItemDraft, DriveItemIdentity } from '../../store/repositories/drive-items';
import { announce, appendFeed, type ChangeActor } from '../changes';
import { posix } from './errors';
import type { PosixCaller, PosixChangeEnv } from './env';
import type { PosixNode } from './nodes';
import { after, nowNs } from './times';

export function actorOf(caller: PosixCaller): ChangeActor {
  return { actorProfileId: caller.profileId, via: 'mount', deviceId: caller.nodeId };
}

export function identityOfItem(env: PosixChangeEnv, item: DriveItem): { dev: string; ino: string } {
  const identity = env.store.driveItems.identityOf(item.id);
  if (identity === null) {
    throw posix('ESTALE', `The item ${item.id} is not indexed yet; scan its folder first.`);
  }
  return identity;
}

export function recordInode(
  env: PosixChangeEnv,
  caller: PosixCaller,
  item: DriveItem,
  patch: DriveInodePatch,
): DriveItem {
  const identity = identityOfItem(env, item);
  return env.store.write(() => {
    const written = env.store.driveItems.write({ item, identity, inode: patch });
    if (written.changed) {
      appendFeed(env, written.item, 'update', actorOf(caller));
      announce(env, written.item.rootId, written.item.parentId, [written.item]);
    }
    return written.item;
  });
}

export function recordOp(
  env: PosixChangeEnv,
  caller: PosixCaller,
  item: DriveItem,
  op: DriveFeedOp,
): void {
  appendFeed(env, item, op, actorOf(caller));
  announce(env, item.rootId, item.parentId, [item]);
}

export function touchDirectory(env: PosixChangeEnv, directory: PosixNode): void {
  const now = nowNs(env);
  env.store.driveInodes.setTimes(directory.inode.id, {
    mtimeNs: after(directory.inode.mtimeNs, now),
    ctimeNs: after(directory.inode.ctimeNs, now),
  });
}

export function touchChange(env: PosixChangeEnv, node: PosixNode): void {
  env.store.driveInodes.setTimes(node.inode.id, {
    ctimeNs: after(node.inode.ctimeNs, nowNs(env)),
  });
}

export interface NewRecord {
  readonly draft: DriveItemDraft;
  readonly identity: DriveItemIdentity;
  readonly inode: DriveInodePatch;
}

function adopted(env: PosixChangeEnv, draft: DriveItemDraft): DriveItemDraft {
  const taken = env.store.driveItems.byPath(draft.rootId, draft.relPath, null);
  if (taken?.kind !== draft.kind) return draft;
  return { ...draft, id: taken.id, addedAt: taken.addedAt };
}

export function recordNew(env: PosixChangeEnv, caller: PosixCaller, record: NewRecord): DriveItem {
  return env.store.write(() => {
    const written = env.store.driveItems.write({
      item: adopted(env, record.draft),
      identity: record.identity,
      inode: record.inode,
    });
    appendFeed(env, written.item, 'create', actorOf(caller));
    announce(env, written.item.rootId, written.item.parentId, [written.item]);
    return written.item;
  });
}
