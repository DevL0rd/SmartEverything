import { dirname, extname, basename } from 'node:path';
import { messageOf } from '@smarteverything/logging';
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
  type DriveFiles,
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
  paths: { readonly relPath: string; readonly trashRelPath: string },
  deferred?: Set<string>,
): Promise<void> {
  const { relPath, trashRelPath } = paths;
  const live = await locate(root, relPath);
  await env.files.clone(live, await locate(root, trashRelPath), await locate(root, tmpRelPath()));
  await env.files.unlink(live);
  if (deferred === undefined) await env.files.syncDirectory(dirname(live));
  else deferred.add(dirname(live));
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
      await dropName(env, root, { relPath: request.relPath, trashRelPath: entry.trashRelPath });
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

export async function moveToTrashDeferred(
  env: FileEnv,
  root: DriveWriteRoot,
  request: TrashRequest,
  barrier: Barrier,
): Promise<TrashMove> {
  const stamp = request.onDisk ? await env.files.stamp(await locate(root, request.relPath)) : null;
  if (request.onDisk && stamp === null) {
    throw new DriveWriteError('missing', 'The item to trash does not exist.');
  }
  const plan: TrashPlan = { request, entry: entryOf(env, root, request), stamp };
  const intent = request.onDisk
    ? env.store.driveIntents.open({
        rootId: root.id,
        op: 'trash',
        fromPath: request.relPath,
        toPath: plan.entry.trashRelPath,
        versionPath: null,
      })
    : null;
  try {
    await moveOne(env, root, plan, barrier);
  } catch (cause) {
    if (intent !== null) await abandonIntent(env, root, intent);
    throw cause;
  }
  return { intent, entry: plan.entry };
}

export interface TrashBatchResult {
  readonly itemId: string;
  readonly move: TrashMove | null;
  readonly failure: Error | null;
}

function errorOf(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(messageOf(cause));
}

async function writeManifestUnsynced(
  files: DriveFiles,
  root: DriveWriteRoot,
  trashRel: string,
  entry: unknown,
): Promise<string> {
  const target = await locate(root, manifestPath(trashRel));
  await files.mkdir(dirname(target));
  await files.writeUnsynced(target, await locate(root, tmpRelPath()), JSON.stringify(entry));
  return target;
}

interface TrashPlan {
  readonly request: TrashRequest;
  readonly entry: DriveTrashEntry;
  readonly stamp: Awaited<ReturnType<FileEnv['files']['stamp']>>;
}

export interface Barrier {
  readonly paths: Set<string>;
  readonly manifests: string[];
}

function syncBarrier(env: FileEnv, barrier: Barrier): Promise<void> {
  return env.files.syncPaths([...barrier.manifests, ...barrier.paths]);
}

async function planTrashes(
  env: FileEnv,
  root: DriveWriteRoot,
  requests: readonly TrashRequest[],
  results: Map<string, TrashBatchResult>,
): Promise<TrashPlan[]> {
  const plans: TrashPlan[] = [];
  for (const request of requests) {
    try {
      const stamp = request.onDisk
        ? await env.files.stamp(await locate(root, request.relPath))
        : null;
      if (request.onDisk && stamp === null) {
        throw new DriveWriteError('missing', 'The item to trash does not exist.');
      }
      plans.push({ request, entry: entryOf(env, root, request), stamp });
    } catch (failure) {
      results.set(request.itemId, {
        itemId: request.itemId,
        move: null,
        failure: errorOf(failure),
      });
    }
  }
  return plans;
}

async function moveOne(
  env: FileEnv,
  root: DriveWriteRoot,
  plan: TrashPlan,
  barrier: Barrier,
): Promise<void> {
  const { request, entry, stamp } = plan;
  const manifest = await writeManifestUnsynced(env.files, root, entry.trashRelPath, entry);
  if (!request.onDisk) {
    barrier.manifests.push(manifest);
    return;
  }
  if (stamp !== null && stamp.nlink > 1 && !stamp.directory && !stamp.symlink) {
    await dropName(
      env,
      root,
      { relPath: request.relPath, trashRelPath: entry.trashRelPath },
      barrier.paths,
    );
  } else {
    await moveWithin(
      env.files,
      root,
      { from: request.relPath, to: entry.trashRelPath, mode: 'replace' },
      barrier.paths,
    );
  }
  barrier.manifests.push(manifest);
}

function openIntents(
  env: FileEnv,
  root: DriveWriteRoot,
  plans: readonly TrashPlan[],
): (DriveIntent | null)[] {
  return env.store.write(() =>
    plans.map((plan) =>
      plan.request.onDisk
        ? env.store.driveIntents.open({
            rootId: root.id,
            op: 'trash',
            fromPath: plan.request.relPath,
            toPath: plan.entry.trashRelPath,
            versionPath: null,
          })
        : null,
    ),
  );
}

export async function moveManyToTrash(
  env: FileEnv,
  root: DriveWriteRoot,
  requests: readonly TrashRequest[],
): Promise<TrashBatchResult[]> {
  const results = new Map<string, TrashBatchResult>();
  const plans = await planTrashes(env, root, requests, results);
  const intents = openIntents(env, root, plans);
  const barrier: Barrier = { paths: new Set(), manifests: [] };
  const moved: { plan: TrashPlan; intent: DriveIntent | null }[] = [];
  for (const [index, plan] of plans.entries()) {
    const intent = intents[index] ?? null;
    try {
      await moveOne(env, root, plan, barrier);
      moved.push({ plan, intent });
    } catch (failure) {
      if (intent !== null) await abandonIntent(env, root, intent);
      results.set(plan.request.itemId, {
        itemId: plan.request.itemId,
        move: null,
        failure: errorOf(failure),
      });
    }
  }
  try {
    await syncBarrier(env, barrier);
  } catch (cause) {
    for (const { intent } of moved) {
      if (intent !== null) await abandonIntent(env, root, intent);
    }
    throw cause;
  }
  for (const { plan, intent } of moved) {
    results.set(plan.request.itemId, {
      itemId: plan.request.itemId,
      move: { intent, entry: plan.entry },
      failure: null,
    });
  }
  return requests.map((request) => {
    const result = results.get(request.itemId);
    if (result === undefined) throw new DriveWriteError('corrupt', 'A trashed item has no result.');
    return result;
  });
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
