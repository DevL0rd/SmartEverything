import { dirname, extname, basename } from 'node:path';
import { DRIVE_TRASH_ENTRY, type DriveTrashEntry } from '@smarteverything/domain';
import type { DriveIntent } from '../store/repositories/drive-intents';
import type { Store } from '../store/store';
import {
  abandonIntent,
  DriveWriteError,
  locate,
  manifestPath,
  moveWithin,
  purgeDeadline,
  TRASH_DIRECTORY,
  tmpRelPath,
  writeManifest,
  type DriveFileStore,
  type DriveWriteRoot,
  type FileEnv,
} from './intents';
import { unlinkVersionFiles } from './versions';

export interface TrashRequest {
  readonly itemId: string;
  readonly relPath: string;
  readonly name: string;
  readonly isFolder: boolean;
  readonly onDisk: boolean;
  readonly bytes: number;
  readonly deletedBy: string | null;
  readonly addedByProfileId: string | null;
}

export interface RestoreEnv extends FileEnv {
  readonly store: DriveFileStore & Pick<Store, 'driveItems'>;
}

export interface TrashMove {
  readonly intent: DriveIntent | null;
  readonly entry: DriveTrashEntry;
}

export interface RestoreMove {
  readonly intent: DriveIntent | null;
  readonly relPath: string;
}

export function trashRelPath(itemId: string): string {
  return `${TRASH_DIRECTORY}/${itemId}`;
}

async function dropName(
  env: FileEnv,
  root: DriveWriteRoot,
  relPath: string,
  trashRelPath: string,
): Promise<void> {
  const live = await locate(root, relPath);
  await env.files.clone(live, await locate(root, trashRelPath), await locate(root, tmpRelPath()));
  await env.files.unlink(live);
  await env.files.syncDirectory(dirname(live));
}

function entryOf(env: FileEnv, root: DriveWriteRoot, request: TrashRequest): DriveTrashEntry {
  const deletedAt = env.now().toISOString();
  return DRIVE_TRASH_ENTRY.parse({
    itemId: request.itemId,
    rootId: root.id,
    name: request.name,
    originalRelPath: request.relPath,
    trashRelPath: trashRelPath(request.itemId),
    isFolder: request.isFolder,
    bytes: request.bytes,
    deletedAt,
    purgeAt: purgeDeadline(deletedAt),
    deletedBy: request.deletedBy,
    addedByProfileId: request.addedByProfileId,
  });
}

export async function moveToTrash(
  env: FileEnv,
  root: DriveWriteRoot,
  request: TrashRequest,
): Promise<TrashMove> {
  const live = await locate(root, request.relPath);
  const stamp = request.onDisk ? await env.files.stamp(live) : null;
  if (request.onDisk && stamp === null) {
    throw new DriveWriteError('missing', 'The item to trash does not exist.');
  }
  const entry = entryOf(env, root, request);
  if (!request.onDisk) {
    await writeManifest(env.files, root, entry.trashRelPath, entry);
    return { intent: null, entry };
  }
  const intent = env.store.driveIntents.open({
    rootId: root.id,
    op: 'trash',
    fromPath: request.relPath,
    toPath: entry.trashRelPath,
    versionPath: null,
  });
  try {
    await writeManifest(env.files, root, entry.trashRelPath, entry);
    if (stamp !== null && stamp.nlink > 1 && !stamp.directory && !stamp.symlink) {
      await dropName(env, root, request.relPath, entry.trashRelPath);
    } else {
      await moveWithin(env.files, root, {
        from: request.relPath,
        to: entry.trashRelPath,
        mode: 'replace',
      });
    }
  } catch (cause) {
    await abandonIntent(env, root, intent);
    throw cause;
  }
  return { intent, entry };
}

function restoredName(name: string, isFolder: boolean, attempt: number): string {
  const suffix = attempt === 0 ? ' (restored)' : ` (restored ${String(attempt + 1)})`;
  const extension = isFolder ? '' : extname(name);
  return `${basename(name, extension)}${suffix}${extension}`;
}

async function parentOrRoot(env: FileEnv, root: DriveWriteRoot, relPath: string): Promise<string> {
  const parent = dirname(relPath);
  if (parent === '.') {
    return '';
  }
  const stamp = await env.files.stamp(await locate(root, parent));
  return stamp?.directory === true ? parent : '';
}

async function freeTarget(
  env: RestoreEnv,
  root: DriveWriteRoot,
  entry: DriveTrashEntry,
): Promise<string> {
  const parent = await parentOrRoot(env, root, entry.originalRelPath);
  const join = (name: string): string => (parent === '' ? name : `${parent}/${name}`);
  const original = join(basename(entry.originalRelPath));
  for (let attempt = -1; ; attempt += 1) {
    const candidate =
      attempt < 0 ? original : join(restoredName(entry.name, entry.isFolder, attempt));
    const free =
      env.store.driveItems.byPath(root.id, candidate, null) === undefined &&
      (await env.files.stamp(await locate(root, candidate))) === null;
    if (free) {
      return candidate;
    }
  }
}

export async function restoreFromTrash(
  env: RestoreEnv,
  root: DriveWriteRoot,
  request: { readonly entry: DriveTrashEntry; readonly onDisk: boolean },
): Promise<RestoreMove> {
  const { entry, onDisk } = request;
  if (onDisk && (await env.files.stamp(await locate(root, entry.trashRelPath))) === null) {
    throw new DriveWriteError('missing', 'The trashed item is missing from the trash folder.');
  }
  const relPath = await freeTarget(env, root, entry);
  if (!onDisk) {
    await env.files.remove(await locate(root, manifestPath(entry.trashRelPath)));
    return { intent: null, relPath };
  }
  const intent = env.store.driveIntents.open({
    rootId: root.id,
    op: 'restore',
    fromPath: entry.trashRelPath,
    toPath: relPath,
    versionPath: null,
  });
  try {
    await moveWithin(env.files, root, { from: entry.trashRelPath, to: relPath, mode: 'keep' });
    await env.files.remove(await locate(root, manifestPath(entry.trashRelPath)));
  } catch (cause) {
    await abandonIntent(env, root, intent);
    throw cause;
  }
  return { intent, relPath };
}

export async function removeTrashEntry(env: FileEnv, entry: DriveTrashEntry): Promise<void> {
  const root = env.store.driveRoots.byId(entry.rootId);
  const purged = env.store.write(() => {
    env.store.driveTrash.forgetPhoto(entry.itemId);
    env.store.driveTrash.remove(entry.itemId);
    env.store.driveGrants.sweepOrphans();
    env.store.driveShortcuts.sweepOrphans();
    return env.store.driveVersions.purgeItem(entry.itemId);
  });
  await env.files.remove(await locate(root, entry.trashRelPath));
  await env.files.remove(await locate(root, manifestPath(entry.trashRelPath)));
  await unlinkVersionFiles(env, purged.unlink);
}
