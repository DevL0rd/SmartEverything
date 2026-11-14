import { randomUUID } from 'node:crypto';
import { basename, dirname, extname } from 'node:path';
import {
  DRIVE_CONFLICT,
  type DriveConflict,
  type DriveConflictResolution,
  type DriveConflictResolve,
  type DriveItem,
} from '@smarteverything/domain';
import { commitContent, type ChangeActor, type ChangeEnv } from './changes';
import { locate } from './intents';
import { commitTrash } from './trash-purge';
import { stageBytes, type StagedBytes } from './versions';

export interface DriveConflictStore {
  readonly insert: (conflict: DriveConflict) => void;
  readonly find: (id: string) => DriveConflict | undefined;
  readonly resolve: (id: string, resolution: DriveConflictResolution, at: string) => DriveConflict;
}

export interface ConflictEnv extends ChangeEnv {
  readonly conflicts: DriveConflictStore;
}

export class ConflictError extends Error {
  override readonly name = 'ConflictError';

  constructor(
    readonly failure: 'unknown' | 'resolved' | 'copy-missing',
    message: string,
  ) {
    super(message);
  }
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
  const root = env.store.driveRoots.byId(rootId);
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
}

export async function commitConflictCopy(
  env: ConflictEnv,
  copy: ConflictCopy,
): Promise<DriveConflict> {
  const { hub, actor } = copy;
  const root = env.store.driveRoots.byId(hub.rootId);
  const relPath = await freeConflictPath(env, hub.rootId, hub, copy.deviceId);
  const recorded: DriveConflict[] = [];
  await commitContent(env, {
    root,
    staged: copy.staged,
    relPath,
    actor,
    alongside: (item) => {
      const conflict = DRIVE_CONFLICT.parse({
        id: randomUUID(),
        rootId: hub.rootId,
        itemId: hub.id,
        conflictItemId: item.id,
        relPath: hub.relPath,
        conflictRelPath: relPath,
        hubRev: hub.rev,
        baseRev: copy.baseRev,
        deviceId: copy.deviceId,
        profileId: actor.actorProfileId,
        at: env.now().toISOString(),
        resolvedAt: null,
        resolution: null,
      });
      env.conflicts.insert(conflict);
      recorded.push(conflict);
    },
  });
  const [conflict] = recorded;
  if (conflict === undefined) {
    throw new ConflictError('copy-missing', 'The conflict copy was not recorded.');
  }
  return conflict;
}

async function keepClient(
  env: ConflictEnv,
  conflict: DriveConflict,
  actor: ChangeActor,
): Promise<void> {
  const root = env.store.driveRoots.byId(conflict.rootId);
  const copy = env.store.driveItems.find(conflict.conflictItemId, null);
  if (copy === undefined) {
    throw new ConflictError('copy-missing', 'The conflict copy is no longer in the library.');
  }
  const staged = await stageBytes(env, root, env.files.read(await locate(root, copy.relPath)));
  await commitContent(env, { root, staged, relPath: conflict.relPath, actor });
  await commitTrash(env, root, copy.id, actor);
}

async function keepHub(
  env: ConflictEnv,
  conflict: DriveConflict,
  actor: ChangeActor,
): Promise<void> {
  if (env.store.driveItems.find(conflict.conflictItemId, null) === undefined) {
    return;
  }
  const root = env.store.driveRoots.byId(conflict.rootId);
  await commitTrash(env, root, conflict.conflictItemId, actor);
}

export async function resolveConflict(
  env: ConflictEnv,
  request: DriveConflictResolve,
  actor: ChangeActor,
): Promise<DriveConflict> {
  const conflict = env.conflicts.find(request.conflictId);
  if (conflict === undefined) {
    throw new ConflictError('unknown', 'There is no such conflict.');
  }
  if (conflict.resolvedAt !== null) {
    throw new ConflictError('resolved', 'The conflict is already resolved.');
  }
  if (request.resolution === 'keep_client') {
    await keepClient(env, conflict, actor);
  } else if (request.resolution === 'keep_hub') {
    await keepHub(env, conflict, actor);
  }
  return env.conflicts.resolve(conflict.id, request.resolution, env.now().toISOString());
}
