import { randomUUID } from 'node:crypto';
import { basename, dirname, extname } from 'node:path';
import {
  type DriveConflict,
  type DriveConflictResolve,
  type DriveItem,
} from '@smarteverything/domain';
import { commitContent, type ChangeActor, type ChangeEnv } from './changes';
import { ConflictError } from './conflict-error';
import { locate } from './intents';
import { commitTrashWith } from './trash-purge';
import { stageBytes, type StagedBytes } from './versions';
import type { ContentAlongside } from './units/content';
import { resultOf, writeDriveOps, type DriveOp, type DriveOpResult } from './units/ops';

export interface DriveConflictStore {
  readonly find: (id: string) => DriveConflict | undefined;
}

export interface ConflictEnv extends ChangeEnv {
  readonly conflicts: DriveConflictStore;
}

const DEVICE_LABEL_LENGTH = 8;

function stamped(at: Date): string {
  const iso = at.toISOString();
  return `${iso.slice(0, 10).replaceAll('-', '')}-${iso.slice(11, 19).replaceAll(':', '')}`;
}

export function conflictName(name: string, at: Date, deviceId: string, attempt: number): string {
  const extension = extname(name);
  const stem = basename(name, extension);
  const suffix = attempt === 0 ? '' : `-${String(attempt + 1)}`;
  const device = deviceId.slice(0, DEVICE_LABEL_LENGTH);
  return `${stem}.sync-conflict-${stamped(at)}-${device}${suffix}${extension}`;
}

async function freeConflictPath(
  env: ConflictEnv,
  rootId: string,
  hub: DriveItem,
  deviceId: string,
): Promise<string> {
  const root = await env.store.host.call('driveRoots', 'byId', rootId);
  const folder = dirname(hub.relPath);
  for (let attempt = 0; ; attempt += 1) {
    const name = conflictName(hub.name, env.now(), deviceId, attempt);
    const relPath = folder === '.' ? name : `${folder}/${name}`;
    if ((await env.files.stamp(await locate(root, relPath))) === null) {
      return relPath;
    }
  }
}

export interface ConflictCopy {
  readonly hub: DriveItem;
  readonly staged: StagedBytes;
  readonly baseRev: number;
  readonly deviceId: string;
  readonly actor: ChangeActor;
  readonly alongside?: readonly ContentAlongside[];
}

export async function commitConflictCopy(
  env: ConflictEnv,
  copy: ConflictCopy,
): Promise<DriveConflict> {
  const { hub, actor } = copy;
  const root = await env.store.host.call('driveRoots', 'byId', hub.rootId);
  const relPath = await freeConflictPath(env, hub.rootId, hub, copy.deviceId);
  const recorded: DriveConflict[] = [];
  const conflict = {
    id: randomUUID(),
    rootId: hub.rootId,
    itemId: hub.id,
    relPath: hub.relPath,
    conflictRelPath: relPath,
    hubRev: hub.rev,
    baseRev: copy.baseRev,
    deviceId: copy.deviceId,
    profileId: actor.actorProfileId,
    at: env.now().toISOString(),
    resolvedAt: null,
    resolution: null,
  };
  await commitContent(env, {
    root,
    staged: copy.staged,
    relPath,
    actor,
    alongside: [{ kind: 'conflict', conflict }, ...(copy.alongside ?? [])],
    settled: (settled) => {
      recorded.push(...settled.conflicts);
    },
  });
  const [kept] = recorded;
  if (kept === undefined) {
    throw new ConflictError('copy-missing', 'The conflict copy was not recorded.');
  }
  return kept;
}

async function keepClient(
  env: ConflictEnv,
  conflict: DriveConflict,
  actor: ChangeActor,
  resolve: DriveOp,
): Promise<DriveOpResult[]> {
  const root = await env.store.host.call('driveRoots', 'byId', conflict.rootId);
  const copy = await env.store.host.call('driveItems', 'find', conflict.conflictItemId, null);
  if (copy === undefined) {
    throw new ConflictError('copy-missing', 'The conflict copy is no longer in the library.');
  }
  const staged = await stageBytes(env, root, env.files.read(await locate(root, copy.relPath)));
  await commitContent(env, { root, staged, relPath: conflict.relPath, actor });
  return commitTrashWith(env, { root, itemId: copy.id, actor, before: [resolve] });
}

async function keepHub(
  env: ConflictEnv,
  conflict: DriveConflict,
  actor: ChangeActor,
  resolve: DriveOp,
): Promise<DriveOpResult[]> {
  const copy = await env.store.host.call('driveItems', 'find', conflict.conflictItemId, null);
  if (copy === undefined) {
    return writeDriveOps(env.store, [resolve]);
  }
  const root = await env.store.host.call('driveRoots', 'byId', conflict.rootId);
  return commitTrashWith(env, { root, itemId: conflict.conflictItemId, actor, before: [resolve] });
}

export async function resolveConflict(
  env: ConflictEnv,
  request: DriveConflictResolve,
  actor: ChangeActor,
): Promise<DriveConflict> {
  const conflict = await env.store.host.call('driveConflicts', 'find', request.conflictId);
  if (conflict === undefined) {
    throw new ConflictError('unknown', 'There is no such conflict.');
  }
  if (conflict.resolvedAt !== null) {
    throw new ConflictError('resolved', 'The conflict is already resolved.');
  }
  const resolve: DriveOp = {
    kind: 'resolve',
    conflictId: conflict.id,
    resolution: request.resolution,
    at: env.now().toISOString(),
  };
  const results =
    request.resolution === 'keep_client'
      ? await keepClient(env, conflict, actor, resolve)
      : request.resolution === 'keep_hub'
        ? await keepHub(env, conflict, actor, resolve)
        : await writeDriveOps(env.store, [resolve]);
  return resultOf(results, 0, 'conflict').conflict;
}
