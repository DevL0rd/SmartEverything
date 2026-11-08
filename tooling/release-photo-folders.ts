import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  linkSync,
  unlinkSync,
  rmSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { syncDirectory, syncPhotoDirectories, withinRoot } from './release-photo-paths.ts';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import {
  PHOTO_FOLDER_RECEIPT,
  PHOTO_FOLDER_RECEIPTS,
  type PhotoFolderReceipt,
} from '../apps/hub/src/photos/folder-receipts.ts';
import { restorePhotoTrash } from './release-photo-trash.ts';

const ROOT = z.object({ id: z.string(), path: z.string() });
const ITEM = z.object({ rel_path: z.string() });
type Root = z.output<typeof ROOT>;

function photoRoots(database: DatabaseSync): readonly Root[] {
  const table = database
    .prepare("select name from sqlite_master where type='table' and name='drive_roots'")
    .get();
  return table === undefined
    ? []
    : z
        .array(ROOT)
        .parse(
          database
            .prepare(
              "select id, path from drive_roots where path is not null and kind='managed' and scope='person'",
            )
            .all(),
        );
}

function receipts(root: Root): readonly PhotoFolderReceipt[] {
  const directory = withinRoot(root.path, PHOTO_FOLDER_RECEIPTS);
  if (!existsSync(directory)) return [];
  return readdirSync(directory).map((name) => {
    const receipt = PHOTO_FOLDER_RECEIPT.parse(
      JSON.parse(readFileSync(join(directory, name), 'utf8')),
    );
    if (receipt.rootId !== root.id || name !== `${receipt.itemId}.json`)
      throw new Error('Photo migration receipt does not match its root or item');
    return receipt;
  });
}

function matches(path: string, receipt: Extract<PhotoFolderReceipt, { kind: 'file' }>): boolean {
  const stat = lstatSync(path, { bigint: true });
  return (
    stat.isFile() &&
    String(stat.dev) === receipt.dev &&
    String(stat.ino) === receipt.ino &&
    String(stat.size) === String(receipt.bytes) &&
    String(stat.mtimeNs) === receipt.mtimeNs
  );
}

function restoreFile(root: Root, receipt: Extract<PhotoFolderReceipt, { kind: 'file' }>): void {
  const from = withinRoot(root.path, receipt.fromPath);
  const to = withinRoot(root.path, receipt.toPath);
  if (from === to) throw new Error('Photo migration paths are identical');
  if (existsSync(from)) {
    if (!matches(from, receipt)) throw new Error('Original photo path contains a different file');
  } else {
    if (!existsSync(to) || !matches(to, receipt))
      throw new Error('Moved photo cannot be verified for rollback');
    mkdirSync(dirname(from), { recursive: true });
    linkSync(to, from);
  }
  syncPhotoDirectories(root.path, dirname(receipt.fromPath));
  if (existsSync(to)) {
    if (!matches(to, receipt)) throw new Error('Moved photo path contains a different file');
    unlinkSync(to);
    syncDirectory(dirname(to));
  }
}

function restoreReceipt(database: DatabaseSync, root: Root, receipt: PhotoFolderReceipt): void {
  if (receipt.kind === 'trash') {
    restorePhotoTrash(database, root, receipt);
    return;
  }
  const row = database
    .prepare('select rel_path from drive_items where id=? and root_id=?')
    .get(receipt.itemId, root.id);
  if (row === undefined && receipt.kind === 'folder') return;
  const item = ITEM.parse(row);
  if (receipt.kind === 'file' && item.rel_path === receipt.toPath) {
    restoreFile(root, { ...receipt, fromPath: receipt.toPath, toPath: receipt.fromPath });
    return;
  }
  if (item.rel_path !== receipt.fromPath)
    throw new Error('Photo receipt differs from the saved database');
  if (receipt.kind === 'file') restoreFile(root, receipt);
  else {
    mkdirSync(withinRoot(root.path, receipt.fromPath), { recursive: true });
    syncPhotoDirectories(root.path, receipt.fromPath);
  }
}

export function restorePhotoFolders(backupDatabase: string): boolean {
  let restored = false;
  const database = new DatabaseSync(backupDatabase, { readOnly: true });
  try {
    for (const root of photoRoots(database)) {
      const entries = receipts(root);
      restored ||= entries.length > 0;
      for (const receipt of entries.filter((entry) => entry.kind === 'folder'))
        restoreReceipt(database, root, receipt);
      for (const receipt of entries.filter((entry) => entry.kind !== 'folder'))
        restoreReceipt(database, root, receipt);
    }
  } finally {
    database.close();
  }
  return restored;
}

export function clearPhotoFolderReceipts(backupDatabase: string): void {
  const database = new DatabaseSync(backupDatabase, { readOnly: true });
  try {
    for (const root of photoRoots(database)) {
      receipts(root);
      rmSync(withinRoot(root.path, PHOTO_FOLDER_RECEIPTS), { recursive: true, force: true });
    }
  } finally {
    database.close();
  }
}
