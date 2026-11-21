import { rmdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { DriveItem } from '@smarteverything/domain';
import type { StoreHost } from '../store/host/host';
import { fsCode } from '../fs-code';
import { isoOf } from '../drive/change-rows';
import { migratePhotoPending } from './folder-pending';
import { locate, type DriveWriteRoot } from '../drive/intents';
import { DriveWriteError } from '../drive/write-error';
import { relPathOf } from '../drive/uploads-tus-target';
import { isFileItem } from '../drive/file-item';
import type { DriveItemIdentity } from '../store/repositories/drive-items';
import { syncPhotoDirectories, writePhotoFolderReceipt } from './folder-receipts';
import { BackupService, type BackupEnv } from './backup';
import type { Relocation } from './folder-migration-units';

interface RelocationFile {
  readonly env: BackupEnv;
  readonly root: DriveWriteRoot;
  readonly item: DriveItem;
  readonly identity: DriveItemIdentity;
}

async function verified(
  { env, root, item, identity }: RelocationFile,
  path: string,
  mtimeNs: string | null,
): Promise<string> {
  const stamp = await env.files.stamp(await locate(root, path));
  if (stamp === null) {
    throw new DriveWriteError('missing', 'Photo relocation requires the original indexed file.');
  }
  const identityMatches =
    identity.dev === stamp.dev.toString() && identity.ino === stamp.ino.toString();
  const modifiedMatches =
    mtimeNs === null
      ? isoOf(stamp.mtimeNs) === item.modifiedAt
      : stamp.mtimeNs.toString() === mtimeNs;
  if (stamp.directory || !identityMatches || !modifiedMatches || stamp.size !== item.bytes) {
    throw new DriveWriteError(
      'corrupt',
      'Photo relocation content or file identity does not match its index.',
    );
  }
  return stamp.mtimeNs.toString();
}

async function relocateBytes(
  file: RelocationFile,
  row: Relocation,
  target: string,
  mtimeNs: string,
): Promise<void> {
  const { env, root } = file;
  const sourcePath = await locate(root, row.from_path);
  const targetPath = await locate(root, target);
  const source = await env.files.stamp(sourcePath);
  const destination = await env.files.stamp(targetPath);
  if (destination === null) {
    await verified(file, row.from_path, mtimeNs);
    await env.files.link(sourcePath, targetPath);
  }
  await verified(file, target, mtimeNs);
  await syncPhotoDirectories(env, root, dirname(target));
  if (source !== null) {
    await verified(file, row.from_path, mtimeNs);
    await env.files.unlink(sourcePath);
    await env.files.syncDirectory(dirname(sourcePath));
  }
}

async function relocate(env: BackupEnv, service: BackupService, row: Relocation): Promise<void> {
  const { host } = env.store;
  const { item, root, identity } = await host.read('photoRelocationSource', { id: row.item_id });
  const owner = root.ownerProfileId;
  if (root.scope !== 'person' || owner === null) {
    throw new DriveWriteError('corrupt', 'Photo relocation requires its original personal Drive.');
  }
  if (identity === null) {
    throw new DriveWriteError('missing', 'Photo relocation requires the original indexed file.');
  }
  const file = { env, root, item, identity };
  const folder = await service.manualTarget(owner);
  const parent = await host.call('driveItems', 'byId', folder.folderId, null);
  const target =
    row.to_path ?? (await relPathOf(env, { root, folder: parent, item: null }, item.name));
  const mtimeNs = row.mtime_ns ?? (await verified(file, row.from_path, null));
  if (row.to_path === null) {
    await host.write('photoRelocationPlan', { id: item.id, target, mtimeNs });
  }
  if (!isFileItem(item))
    throw new DriveWriteError('missing', 'The original photo identity is missing.');
  await writePhotoFolderReceipt(env, root, {
    kind: 'file',
    rootId: root.id,
    itemId: item.id,
    fromPath: row.from_path,
    toPath: target,
    ...identity,
    bytes: item.bytes,
    mtimeNs,
    sha256: item.sha256,
  });
  await relocateBytes(file, row, target, mtimeNs);
  await host.write('photoRelocationFinish', {
    item,
    target: { parentId: parent.id, relPath: target, name: target.slice(folder.path.length + 1) },
    owner,
  });
}

export async function migratePhotosFolder(env: BackupEnv, signal?: AbortSignal): Promise<void> {
  const pending = await env.store.host.read('photoRelocations', null);
  const service = new BackupService(env);
  if (pending.length > 0)
    env.log.info('photos.folders_migration_started', { items: pending.length });
  for (const row of pending) {
    signal?.throwIfAborted();
    await relocate(env, service, row);
  }
  signal?.throwIfAborted();
  await migratePhotoPending(env, service);
  await removeOldFolders(env);
  if (pending.length > 0) env.log.info('photos.folders_migrated', { items: pending.length });
}

async function removeOldFolders(env: BackupEnv): Promise<void> {
  for (const id of await env.store.host.read('photoOldFolders', null)) {
    await removeOldFolder(env, id);
  }
}

async function removeOldFolder(env: BackupEnv, id: string): Promise<void> {
  const { host } = env.store;
  const { item, root, occupied } = await host.read('photoOldFolderState', { id });
  if (occupied) {
    await host.write('photoOldFolderRetain', { id });
    return;
  }
  try {
    const path = await locate(root, item.relPath);
    await writePhotoFolderReceipt(env, root, {
      kind: 'folder',
      rootId: root.id,
      itemId: item.id,
      fromPath: item.relPath,
    });
    await rmdir(path);
    await env.files.syncDirectory(dirname(path));
  } catch (cause) {
    if (fsCode(cause) === 'ENOTEMPTY' || fsCode(cause) === 'EEXIST') {
      await host.write('photoOldFolderRetain', { id });
      return;
    }
    if (fsCode(cause) !== 'ENOENT') throw cause;
  }
  await host.write('photoOldFolderRemove', { item });
}

export async function assertPhotosFolderPrepared(host: StoreHost): Promise<void> {
  if ((await host.read('photoFoldersPending', null)) > 0) {
    throw new Error(
      'Hub data preparation is incomplete. Run service.mjs --prepare-data <absolute data root> before starting the Hub.',
    );
  }
}
