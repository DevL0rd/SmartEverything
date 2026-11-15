import { statfs } from 'node:fs/promises';
import { ApiError } from '@smarteverything/domain';
import type { Store } from '../store/store';
import type { DataSpaceProbe } from './data-space';
import type { DriveQuotaSource } from './quotas';
import type { DriveReadService } from './service-read';
import type { DriveActor } from './access';

export interface FsSpace {
  readonly totalBytes: number;
  readonly usedBytes: number;
  readonly freeBytes: number;
}

export interface FsSpaceEnv {
  readonly read: Pick<DriveReadService, 'rootFor' | 'readItem'>;
  readonly store: Pick<Store, 'driveRoots'>;
  readonly quota: DriveQuotaSource;
  readonly probe: Pick<DataSpaceProbe, 'space'>;
}

interface Measured {
  readonly used: number;
  readonly path: string;
  readonly quotaOf: string | null;
}

function quotaFree(env: FsSpaceEnv, profileId: string | null): number | null {
  if (profileId === null) return null;
  const { quota, usage } = env.quota(profileId);
  if (quota === null) return null;
  return Math.max(0, quota - (usage.live + usage.versions + usage.trash));
}

function measured(
  env: FsSpaceEnv,
  actor: DriveActor,
  rootId: string,
  base: string | undefined,
): Measured {
  if (base === undefined) {
    const drive = env.read.rootFor(actor, rootId);
    return {
      used: drive.bytes,
      path: drive.path,
      quotaOf: drive.scope === 'person' ? drive.ownerProfileId : null,
    };
  }
  const folder = env.read.readItem(actor, base);
  if (folder.rootId !== rootId || folder.kind !== 'folder') {
    throw new ApiError('not_found', 'There is no such folder in this drive.');
  }
  const drive = env.store.driveRoots.byId(rootId);
  const own = drive.scope === 'person' && drive.ownerProfileId === actor.profileId;
  return { used: folder.bytes, path: drive.path, quotaOf: own ? actor.profileId : null };
}

async function spaceOf(env: FsSpaceEnv, target: Measured): Promise<FsSpace> {
  const disk = await env.probe.space(target.path);
  const allowed = quotaFree(env, target.quotaOf);
  const freeBytes = allowed === null ? disk.freeBytes : Math.min(allowed, disk.freeBytes);
  return { totalBytes: target.used + freeBytes, usedBytes: target.used, freeBytes };
}

export async function fsSpace(
  env: FsSpaceEnv,
  actor: DriveActor,
  rootId: string,
  base: string | undefined,
): Promise<FsSpace> {
  return spaceOf(env, measured(env, actor, rootId, base));
}

export interface InodeCounts {
  readonly files: number;
  readonly free: number;
}

export type InodeProbe = (path: string) => Promise<InodeCounts>;

export const nodeInodeProbe: InodeProbe = async (path) => {
  const counts = await statfs(path);
  return { files: counts.files, free: counts.ffree };
};

export interface FsStatfsEnv extends FsSpaceEnv {
  readonly inodes: InodeProbe;
}

export interface FsStatfs extends FsSpace {
  readonly files: number;
  readonly freeFiles: number;
}

export async function fsStatfs(
  env: FsStatfsEnv,
  actor: DriveActor,
  rootId: string,
  base: string | undefined,
): Promise<FsStatfs> {
  const target = measured(env, actor, rootId, base);
  const space = await spaceOf(env, target);
  const counts = await env.inodes(target.path);
  return { ...space, files: counts.files, freeFiles: counts.free };
}
