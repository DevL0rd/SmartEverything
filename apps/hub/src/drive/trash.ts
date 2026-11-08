import { dirname, extname, basename } from 'node:path';
import { DRIVE_TRASH_ENTRY, type DriveTrashEntry } from '@smarteverything/domain';
import type { DriveIntent } from '../store/repositories/drive-intents';
import {
  abandonIntent,
  assertWritable,
  DriveWriteError,
  locate,
  manifestPath,
  moveWithin,
  physicalRoot,
  purgeDeadline,
  TRASH_DIRECTORY,
  writeManifest,
  type DriveWriteRoot,
  type FileEnv,
} from './intents';
import { unlinkVersionFiles } from './versions';

export interface TrashRequest {
  readonly itemId: string;
  readonly relPath: string;
  readonly name: string;
  readonly isFolder: boolean;
  readonly bytes: number;
  readonly deletedBy: string | null;
  readonly addedByProfileId: string | null;
}

export interface TrashMove {
  readonly intent: DriveIntent;
  readonly entry: DriveTrashEntry;
}

export interface RestoreMove {
  readonly intent: DriveIntent;
  readonly relPath: string;
}

export function trashRelPath(itemId: string): string {
  return `${TRASH_DIRECTORY}/${itemId}`;
}

export async function moveToTrash(
  env: FileEnv,
  root: DriveWriteRoot,
  request: TrashRequest,
): Promise<TrashMove> {
  assertWritable(root);
  if ((await env.files.stamp(await locate(root, request.relPath))) === null) {
    throw new DriveWriteError('missing', 'The item to trash does not exist.');
  }
  const deletedAt = env.now().toISOString();
  const entry = DRIVE_TRASH_ENTRY.parse({
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
  const intent = env.store.driveIntents.open({
    rootId: root.id,
    op: 'trash',
    fromPath: request.relPath,
    toPath: entry.trashRelPath,
    versionPath: null,
  });
  try {
    await writeManifest(env.files, root, entry.trashRelPath, entry);
    await moveWithin(env.files, root, {
      from: request.relPath,
      to: entry.trashRelPath,
      mode: 'replace',
    });
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
  env: FileEnv,
  root: DriveWriteRoot,
  entry: DriveTrashEntry,
): Promise<string> {
  const parent = await parentOrRoot(env, root, entry.originalRelPath);
  const join = (name: string): string => (parent === '' ? name : `${parent}/${name}`);
  const original = join(basename(entry.originalRelPath));
  for (let attempt = -1; ; attempt += 1) {
    const candidate =
      attempt < 0 ? original : join(restoredName(entry.name, entry.isFolder, attempt));
    if ((await env.files.stamp(await locate(root, candidate))) === null) {
      return candidate;
    }
  }
}

export async function restoreFromTrash(
  env: FileEnv,
  root: DriveWriteRoot,
  entry: DriveTrashEntry,
): Promise<RestoreMove> {
  assertWritable(root);
  if ((await env.files.stamp(await locate(root, entry.trashRelPath))) === null) {
    throw new DriveWriteError('missing', 'The trashed item is missing from the trash folder.');
  }
  const relPath = await freeTarget(env, root, entry);
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
  const root = physicalRoot(env.store.driveRoots.byId(entry.rootId));
  const purged = env.store.write(() => {
    env.store.driveTrash.remove(entry.itemId);
    env.store.driveTrash.forgetPhoto(entry.itemId);
    return env.store.driveVersions.purgeItem(entry.itemId);
  });
  await env.files.remove(await locate(root, entry.trashRelPath));
  await env.files.remove(await locate(root, manifestPath(entry.trashRelPath)));
  await unlinkVersionFiles(env, purged.unlink);
}
