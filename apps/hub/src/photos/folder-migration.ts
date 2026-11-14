import { rmdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { DriveItem } from '@smarteverything/domain';
import { z } from 'zod';
import type { Sql } from '../store/sql';
import { fsCode } from '../fs-code';
import { announce, appendFeed, isoOf } from '../drive/changes';
import { migratePhotoPending } from './folder-pending';
import { repathItem } from '../drive/service-write-repath';
import { DriveWriteError, locate, type DriveWriteRoot } from '../drive/intents';
import { relPathOf } from '../drive/uploads-tus-target';
import { syncPhotoDirectories, writePhotoFolderReceipt } from './folder-receipts';
import { BackupService, type BackupEnv } from './backup';

const RELOCATION = z.strictObject({
  item_id: z.string(),
  from_path: z.string(),
  to_path: z.string().nullable(),
  mtime_ns: z.string().nullable(),
});

type Relocation = z.output<typeof RELOCATION>;

interface RelocationFile {
  readonly env: BackupEnv;
  readonly root: DriveWriteRoot;
  readonly item: DriveItem;
}

async function verified(
  { env, root, item }: RelocationFile,
  path: string,
  mtimeNs: string | null,
): Promise<string> {
  const stamp = await env.files.stamp(await locate(root, path));
  const identity = env.store.driveItems.identityOf(item.id);
  if (stamp === null || identity === null) {
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
  { env, root, item }: RelocationFile,
  row: Relocation,
  target: string,
  mtimeNs: string,
): Promise<void> {
  const sourcePath = await locate(root, row.from_path);
  const targetPath = await locate(root, target);
  const source = await env.files.stamp(sourcePath);
  const destination = await env.files.stamp(targetPath);
  if (destination === null) {
    await verified({ env, root, item }, row.from_path, mtimeNs);
    await env.files.link(sourcePath, targetPath);
  }
  await verified({ env, root, item }, target, mtimeNs);
  await syncPhotoDirectories(env, root, dirname(target));
  if (source !== null) {
    await verified({ env, root, item }, row.from_path, mtimeNs);
    await env.files.unlink(sourcePath);
    await env.files.syncDirectory(dirname(sourcePath));
  }
}

async function relocate(env: BackupEnv, service: BackupService, row: Relocation): Promise<void> {
  const item = env.store.driveItems.byId(row.item_id, null);
  const rootRow = env.store.driveRoots.byId(item.rootId);
  if (rootRow.scope !== 'person' || rootRow.ownerProfileId === null) {
    throw new DriveWriteError('corrupt', 'Photo relocation requires its original personal Drive.');
  }
  const root = rootRow;
  const folder = await service.manualTarget(rootRow.ownerProfileId);
  const parent = env.store.driveItems.byId(folder.folderId, null);
  const target =
    row.to_path ?? (await relPathOf(env, { root, folder: parent, item: null }, item.name));
  const mtimeNs = row.mtime_ns ?? (await verified({ env, root, item }, row.from_path, null));
  if (row.to_path === null) {
    env.sql.run(
      'plan the photo relocation',
      'update drive_photo_relocations set to_path = $target, mtime_ns = $mtimeNs where item_id = $id',
      { target, mtimeNs, id: item.id },
    );
  }
  const identity = env.store.driveItems.identityOf(item.id);
  if (identity === null || item.kind === 'folder')
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
  await relocateBytes({ env, root, item }, row, target, mtimeNs);
  env.store.write(() => {
    repathItem(
      env,
      item,
      { parentId: parent.id, relPath: target, name: target.slice(folder.path.length + 1) },
      { op: 'move', actor: { actorProfileId: rootRow.ownerProfileId, via: 'app', deviceId: null } },
    );
    env.sql.run(
      'finish the photo relocation',
      'delete from drive_photo_relocations where item_id = $id',
      { id: item.id },
    );
  });
}

export async function migratePhotosFolder(env: BackupEnv, signal?: AbortSignal): Promise<void> {
  const pending = env.sql.all(
    RELOCATION,
    'select item_id, from_path, to_path, mtime_ns from drive_photo_relocations order by item_id',
  );
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
  const folders = env.sql.all(
    z.strictObject({ item_id: z.string() }),
    `select f.item_id from drive_photo_old_folders f join drive_items i on i.id = f.item_id
      order by length(i.rel_path) desc, i.id`,
  );
  for (const row of folders)
    await removeOldFolder(env, env.store.driveItems.byId(row.item_id, null));
}

function retainOldFolder(env: BackupEnv, id: string): void {
  env.sql.run(
    'retain a nonempty former photo folder',
    'delete from drive_photo_old_folders where item_id = $id',
    { id },
  );
}

async function removeOldFolder(env: BackupEnv, item: DriveItem): Promise<void> {
  const root = env.store.driveRoots.byId(item.rootId);
  const children = env.store.driveItems.children({
    rootId: root.id,
    parentId: item.id,
    after: null,
    limit: 1,
    viewer: null,
  });
  const pending = env.sql.get(
    z.strictObject({ id: z.string() }),
    "select id from drive_uploads where target_kind = 'folder' and target_id = $id and state = 'open'",
    { id: item.id },
  );
  if (children.entries.length > 0 || pending !== undefined) {
    retainOldFolder(env, item.id);
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
      retainOldFolder(env, item.id);
      return;
    }
    if (fsCode(cause) !== 'ENOENT') throw cause;
  }
  env.store.write(() => {
    appendFeed(env, { ...item, rev: item.rev + 1 }, 'delete', {
      actorProfileId: null,
      via: 'scan',
      deviceId: null,
    });
    env.store.driveItems.remove(item.id);
    env.store.driveGrants.sweepOrphans();
    announce(env, item.rootId, item.parentId, []);
  });
}

export function assertPhotosFolderPrepared(sql: Sql): void {
  const pending = sql.get(
    z.strictObject({ total: z.int().nonnegative() }),
    `select (select count(*) from drive_photo_relocations)
      + (select count(*) from drive_photo_old_folders)
      + (select count(*) from drive_photo_trash_folders) as total`,
  );
  if (pending === undefined || pending.total > 0) {
    throw new Error(
      'Hub data preparation is incomplete. Run service.mjs --prepare-data <absolute data root> before starting the Hub.',
    );
  }
}
