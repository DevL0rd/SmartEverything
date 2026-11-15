import type {
  PhotoCopyKeptReason,
  PhotoFolderCopies,
  PhotoFolderCopiesRequest,
} from '@smarteverything/domain';
import { z } from 'zod';
import { inList, type Sql } from '../store/sql';

const FLAG = z.union([z.literal(0), z.literal(1)]);

const COPY_ROW = z.strictObject({
  local_id: z.string().min(1),
  item_id: z.string().min(1),
  bytes: z.int().nonnegative(),
  other_device: FLAG,
  other_folder: FLAG,
  shared: FLAG,
  edited: FLAG,
  album: FLAG,
});

type CopyRow = z.infer<typeof COPY_ROW>;

function reasonOf(row: CopyRow): PhotoCopyKeptReason | null {
  if (row.other_device === 1) return 'other_device';
  if (row.other_folder === 1) return 'other_folder';
  if (row.shared === 1) return 'shared';
  if (row.edited === 1) return 'edited';
  if (row.album === 1) return 'album';
  return null;
}

const COPIES_SQL = `select a.local_id, a.item_id, i.bytes,
    exists (select 1 from drive_backup_assets o
      where o.item_id = a.item_id and o.backup_device_id <> a.backup_device_id) as other_device,
    exists (select 1 from drive_backup_assets o
      left join photo_asset_folders g
        on g.backup_device_id = o.backup_device_id and g.local_id = o.local_id
      where o.item_id = a.item_id and o.backup_device_id = a.backup_device_id
        and (g.folder_key is null or g.folder_key <> $folderKey)) as other_folder,
    (r.scope = 'home' or r.owner_profile_id is not $profileId) as shared,
    (exists (select 1 from photo_edits e where e.item_id = a.item_id)
      or exists (select 1 from photo_meta_overrides v where v.item_id = a.item_id)) as edited,
    exists (select 1 from drive_album_items m where m.item_id = a.item_id) as album
  from drive_backup_assets a
  join photo_asset_folders f on f.backup_device_id = a.backup_device_id and f.local_id = a.local_id
  join drive_items i on i.id = a.item_id
  join drive_roots r on r.id = i.root_id
  where a.backup_device_id = $backupDeviceId and f.folder_key = $folderKey
    and i.kind in ('image', 'video')`;

export function folderCopiesOf(
  sql: Sql,
  scope: { readonly profileId: string; readonly backupDeviceId: string },
  input: PhotoFolderCopiesRequest,
): PhotoFolderCopies {
  const locals = inList('a.local_id', 'localIds', [...new Set(input.localIds)]);
  const rows = sql.all(
    COPY_ROW,
    `${COPIES_SQL} and ${locals.text} order by a.item_id, a.local_id`,
    {
      ...locals.parameters,
      profileId: scope.profileId,
      backupDeviceId: scope.backupDeviceId,
      folderKey: input.folderKey,
    },
  );
  const items = new Map<string, { itemId: string; bytes: number; localIds: string[] }>();
  const kept = new Map<string, PhotoCopyKeptReason>();
  for (const row of rows) {
    const reason = reasonOf(row);
    if (reason !== null) {
      kept.set(row.item_id, reason);
      continue;
    }
    const known = items.get(row.item_id);
    if (known === undefined)
      items.set(row.item_id, { itemId: row.item_id, bytes: row.bytes, localIds: [row.local_id] });
    else known.localIds.push(row.local_id);
  }
  return {
    items: [...items.values()],
    kept: [...kept].map(([itemId, reason]) => ({ itemId, reason })),
  };
}
