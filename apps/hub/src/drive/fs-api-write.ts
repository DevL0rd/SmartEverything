import { stat, utimes } from 'node:fs/promises';
import { basename } from 'node:path';
import { ApiError, type DriveChangeResult, type DriveItem } from '@smarteverything/domain';
import {
  announce,
  commitContent,
  folderDraft,
  identityOf,
  isoOf,
  recordItem,
  type ChangeActor,
  type ChangeEnv,
} from './changes';
import type { FsEntry } from './fs-api-ops';
import { DriveWriteError, locate, moveWithin, type DriveWriteRoot } from './intents';
import { DrivePathError, normalizeRelativePath } from './paths';
import { repathItem } from './service-write-repath';
import { stageInPlace } from './versions';
import { changeActorOf, type DriveCaller } from './service-write-support';

export interface FsWriter {
  readonly profileId: string;
  readonly nodeId: string;
}

const WRITE_REFUSAL = {
  exists: 'conflict',
  missing: 'not_found',
  corrupt: 'internal',
} as const;

export function refusalOf(cause: unknown): ApiError | null {
  if (cause instanceof DriveWriteError) {
    return new ApiError(WRITE_REFUSAL[cause.failure], cause.message);
  }
  if (cause instanceof DrivePathError) {
    return new ApiError(
      cause.failure === 'missing' ? 'not_found' : 'invalid_request',
      cause.message,
    );
  }
  return null;
}

export function refused<T>(operation: () => T): T {
  try {
    return operation();
  } catch (cause) {
    throw refusalOf(cause) ?? cause;
  }
}

export function entryOf(item: DriveItem, base: DriveItem | null): FsEntry {
  const directory = item.kind === 'folder';
  return {
    id: item.id,
    parentId: item.parentId === base?.id ? null : item.parentId,
    name: item.name,
    directory,
    size: directory ? 0 : item.bytes,
    modifiedAt: item.modifiedAt,
    rev: item.rev,
    etag: item.etag,
  };
}

export function joined(parent: DriveItem | null, name: string): string {
  return normalizeRelativePath(parent === null ? name : `${parent.relPath}/${name}`);
}

export function settled(result: DriveChangeResult): void {
  const clash = result.conflicts[0];
  if (clash !== undefined) {
    throw new ApiError('conflict', `${clash.name} already exists in that folder.`);
  }
  const failure = result.failed[0];
  if (failure !== undefined) {
    throw new ApiError('invalid_request', failure.reason);
  }
}

export function mount(caller: FsWriter): DriveCaller {
  return {
    profileId: caller.profileId,
    owner: false,
    via: 'mount',
    deviceId: caller.nodeId,
  };
}

function actorOf(caller: FsWriter): ChangeActor {
  return changeActorOf(mount(caller));
}

function assertFree(env: ChangeEnv, rootId: string, relPath: string): void {
  if (env.store.driveItems.byPath(rootId, relPath, null) !== undefined) {
    throw new ApiError('conflict', `${basename(relPath)} already exists in that folder.`);
  }
}

export async function makeFolder(
  env: ChangeEnv,
  caller: FsWriter,
  target: {
    readonly root: DriveWriteRoot;
    readonly parent: DriveItem | null;
    readonly name: string;
  },
): Promise<DriveItem> {
  const { root, parent } = target;
  const relPath = joined(parent, target.name);
  assertFree(env, root.id, relPath);
  const path = await locate(root, relPath);
  if ((await env.files.stamp(path)) !== null) {
    throw new DriveWriteError('exists', 'A folder or file with that name is already on disk.');
  }
  await env.files.mkdir(path);
  const stamp = await env.files.stamp(path);
  if (stamp === null) {
    throw new DriveWriteError('missing', 'The new folder is missing after it was made.');
  }
  return recordItem(env, {
    draft: folderDraft(
      {
        rootId: root.id,
        parentId: parent?.id ?? null,
        relPath,
        modifiedAt: isoOf(stamp.mtimeNs),
        addedAt: env.now().toISOString(),
        outside: false,
        addedByProfileId: caller.profileId,
      },
      0,
    ),
    identity: identityOf(stamp),
    op: 'create',
    actor: actorOf(caller),
  });
}

interface Relocation {
  readonly root: DriveWriteRoot;
  readonly item: DriveItem;
  readonly parent: DriveItem | null;
  readonly name: string;
}

async function replaceOnto(
  env: ChangeEnv,
  caller: FsWriter,
  target: { readonly root: DriveWriteRoot; readonly item: DriveItem; readonly relPath: string },
): Promise<DriveItem> {
  const { root, item, relPath } = target;
  const staged = await stageInPlace(env, root, item.relPath);
  const result = await commitContent(env, {
    root,
    staged,
    relPath,
    actor: actorOf(caller),
    alongside: (): void => {
      env.store.driveItems.remove(item.id);
    },
  });
  announce(env, root.id, item.parentId, [item]);
  return result.item;
}

async function moveOnDisk(
  env: ChangeEnv,
  caller: FsWriter,
  move: Relocation & { readonly relPath: string },
): Promise<DriveItem> {
  const { root, item, parent, relPath } = move;
  await moveWithin(env.files, root, { from: item.relPath, to: relPath, mode: 'keep' });
  try {
    repathItem(
      env,
      item,
      { parentId: parent?.id ?? null, relPath, name: basename(relPath) },
      { op: (parent?.id ?? null) === item.parentId ? 'rename' : 'move', actor: actorOf(caller) },
    );
  } catch (cause) {
    await moveWithin(env.files, root, { from: relPath, to: item.relPath, mode: 'keep' });
    throw cause;
  }
  return env.store.driveItems.byId(item.id, null);
}

export async function relocate(
  env: ChangeEnv,
  caller: FsWriter,
  move: Relocation,
): Promise<DriveItem> {
  const { root, item, parent } = move;
  const relPath = joined(parent, move.name);
  if (relPath === item.relPath) {
    return item;
  }
  const over = env.store.driveItems.byPath(root.id, relPath, null);
  if (over === undefined) {
    return moveOnDisk(env, caller, { ...move, relPath });
  }
  if (item.kind === 'folder' || over.kind === 'folder') {
    throw new ApiError('conflict', `${basename(relPath)} already exists in that folder.`);
  }
  return replaceOnto(env, caller, { root, item, relPath });
}

export async function stampItem(
  env: ChangeEnv,
  caller: FsWriter,
  target: { readonly root: DriveWriteRoot; readonly item: DriveItem; readonly modifiedAt: string },
): Promise<DriveItem> {
  const { item } = target;
  const path = await locate(target.root, item.relPath);
  const before = await stat(path);
  const modifiedAt = new Date(target.modifiedAt);
  if (
    item.modifiedAt === modifiedAt.toISOString() &&
    before.mtime.getTime() === modifiedAt.getTime()
  ) {
    return item;
  }
  await utimes(path, before.atime, modifiedAt);
  const stamp = await env.files.stamp(path);
  if (stamp === null) {
    throw new DriveWriteError('missing', 'The item is missing from disk.');
  }
  return recordItem(env, {
    draft: { ...item, modifiedAt: isoOf(stamp.mtimeNs) },
    identity: identityOf(stamp),
    op: 'update',
    actor: actorOf(caller),
  });
}
