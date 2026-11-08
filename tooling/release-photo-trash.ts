import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { DRIVE_TRASH_ENTRY } from '@smarteverything/domain';
import { z } from 'zod';
import { syncDirectory, withinRoot } from './release-photo-paths.ts';

const ROW = z.object({
  item_id: z.string(),
  root_id: z.string(),
  name: z.string(),
  original_rel_path: z.string(),
  trash_rel_path: z.string(),
  is_folder: z.union([z.literal(0), z.literal(1)]),
  bytes: z.number(),
  deleted_at: z.string(),
  purge_at: z.string(),
  deleted_by: z.string().nullable(),
  added_by_profile_id: z.string().nullable(),
});

export function restorePhotoTrash(
  database: DatabaseSync,
  root: { readonly id: string; readonly path: string },
  receipt: { readonly itemId: string; readonly fromPath: string; readonly toPath: string },
): void {
  const row = ROW.parse(
    database
      .prepare('select * from drive_trash where item_id=? and root_id=?')
      .get(receipt.itemId, root.id),
  );
  if (![receipt.fromPath, receipt.toPath].includes(row.original_rel_path))
    throw new Error('Trash receipt differs from saved database');
  const path = withinRoot(root.path, `${row.trash_rel_path}.json`);
  const restored = DRIVE_TRASH_ENTRY.parse({
    itemId: row.item_id,
    rootId: row.root_id,
    name: row.name,
    originalRelPath: row.original_rel_path,
    trashRelPath: row.trash_rel_path,
    isFolder: row.is_folder === 1,
    bytes: row.bytes,
    deletedAt: row.deleted_at,
    purgeAt: row.purge_at,
    deletedBy: row.deleted_by,
    addedByProfileId: row.added_by_profile_id,
  });
  const current = DRIVE_TRASH_ENTRY.parse(JSON.parse(readFileSync(path, 'utf8')));
  if (
    current.itemId !== row.item_id ||
    current.rootId !== root.id ||
    ![receipt.fromPath, receipt.toPath].includes(current.originalRelPath)
  )
    throw new Error('Trash manifest changed after photo migration');
  if (
    JSON.stringify({ ...current, originalRelPath: row.original_rel_path }) !==
    JSON.stringify(restored)
  )
    throw new Error('Trash manifest metadata changed after photo migration');
  const staged = `${path}.release-restore`;
  writeFileSync(staged, JSON.stringify(restored), { mode: 0o600, flush: true });
  renameSync(staged, path);
  syncDirectory(dirname(path));
}
