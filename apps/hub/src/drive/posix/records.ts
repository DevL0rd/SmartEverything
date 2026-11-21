import type { DriveFeedOp, DriveItem } from '@smarteverything/domain';
import type { DriveInodeTimes } from '../../store/repositories/drive-inodes';
import type { DriveInodePatch } from '../../store/repositories/drive-item-inodes';
import type { DriveItemDraft, DriveItemIdentity } from '../../store/repositories/drive-items';
import type { ChangeActor } from '../changes';
import type { DriveOp } from '../units/ops';
import { posix } from './errors';
import type { PosixCaller, PosixChangeEnv } from './env';
import type { PosixNode } from '../units/posix';
import { after, nowNs } from './times';

export function actorOf(caller: PosixCaller): ChangeActor {
  return { actorProfileId: caller.profileId, via: 'mount', deviceId: caller.nodeId };
}

export async function identityOfItem(
  env: PosixChangeEnv,
  item: DriveItem,
): Promise<DriveItemIdentity> {
  const identity = await env.store.host.call('driveItems', 'identityOf', item.id);
  if (identity === null) {
    throw posix('ESTALE', `The item ${item.id} is not indexed yet; scan its folder first.`);
  }
  return identity;
}

export function announceOp(caller: PosixCaller, item: DriveItem, op: DriveFeedOp): DriveOp {
  return { kind: 'announce', item, op, actor: actorOf(caller) };
}

export function touchDirectory(env: PosixChangeEnv, directory: PosixNode): DriveOp {
  const now = nowNs(env);
  return {
    kind: 'times',
    inodeId: directory.inode.id,
    times: {
      mtimeNs: after(directory.inode.mtimeNs, now),
      ctimeNs: after(directory.inode.ctimeNs, now),
    },
  };
}

export function changeTimes(env: PosixChangeEnv, node: PosixNode): DriveInodeTimes {
  return { ctimeNs: after(node.inode.ctimeNs, nowNs(env)) };
}

export function touchChange(env: PosixChangeEnv, node: PosixNode): DriveOp {
  return { kind: 'times', inodeId: node.inode.id, times: changeTimes(env, node) };
}

export interface NewRecord {
  readonly draft: DriveItemDraft;
  readonly identity: DriveItemIdentity;
  readonly inode: DriveInodePatch;
}

export function createOp(caller: PosixCaller, record: NewRecord): DriveOp {
  return { kind: 'create', ...record, actor: actorOf(caller) };
}
