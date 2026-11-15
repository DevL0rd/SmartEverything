import { posix } from 'node:path';
import {
  PHOTO_FOLDER_KEY,
  photoFolderKey,
  photoFolderKindOf,
  type PhotoFolder,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { DriveActor } from '../drive/access';
import { SQL_JSON, type Sql } from '../store/sql';
import { DRIVE_FOLDER_OF } from './folder-scope';
import { PHOTO_FROM, PHOTO_SHOWN, visibility } from './library';

const COVER = {
  total: z.int().positive(),
  cover_item_id: z.string(),
  cover_rev: z.int().positive(),
  latest_at: z.string(),
};

const DRIVE_ROW = z.strictObject({
  ...COVER,
  folder_id: z.string(),
  folder_name: z.string().nullable(),
  folder_path: z.string().nullable(),
  root_label: z.string(),
});

const ORIGIN_ROW = z.strictObject({
  ...COVER,
  folder_key: PHOTO_FOLDER_KEY,
  name: z.string(),
  devices: SQL_JSON.pipe(z.array(z.string())),
});

const RANKED = `ranked as (
  select *, row_number() over (partition by folder order by taken_at desc, id desc) as newest
  from shown
)`;

const COVER_COLUMNS = `count(distinct k.id) as total,
  max(case when k.newest = 1 then k.id end) as cover_item_id,
  max(case when k.newest = 1 then k.rev end) as cover_rev,
  max(k.taken_at) as latest_at`;

const DRIVE_FOLDERS = `with shown as (
    select i.id, i.rev, i.taken_at, ${DRIVE_FOLDER_OF()} as folder
    from ${PHOTO_FROM} where ${PHOTO_SHOWN}
  ), ${RANKED}
  select k.folder as folder_id, ${COVER_COLUMNS},
    f.name as folder_name, f.rel_path as folder_path,
    case coalesce(fr.scope, rr.scope) when 'home' then 'Shared Drive' else 'My Drive' end as root_label
  from ranked k
    left join drive_items f on f.id = k.folder
    left join drive_roots fr on fr.id = f.root_id
    left join drive_roots rr on rr.id = k.folder
  group by k.folder`;

const ORIGIN_FOLDERS = `with shown as (
    select distinct o.folder_key as folder, o.folder_name, d.name as device, i.id, i.rev, i.taken_at
    from ${PHOTO_FROM}
      join drive_backup_assets a on a.item_id = i.id
      join photo_asset_folders o
        on o.backup_device_id = a.backup_device_id and o.local_id = a.local_id
      join drive_backup_devices d on d.id = a.backup_device_id
    where ${PHOTO_SHOWN} and d.profile_id = $profile
  ), ${RANKED}
  select k.folder as folder_key, max(k.folder_name) as name,
    json_group_array(distinct k.device) as devices, ${COVER_COLUMNS}
  from ranked k group by k.folder`;

export type ListedFolder = Omit<PhotoFolder, 'hidden'>;

function placeOfDrive(row: z.output<typeof DRIVE_ROW>): string {
  if (row.folder_path === null) return 'Drive';
  const parent = posix.dirname(row.folder_path);
  return parent === '.' ? row.root_label : `${row.root_label} / ${parent}`;
}

function driveFolder(row: z.output<typeof DRIVE_ROW>): ListedFolder {
  return {
    key: photoFolderKey('drive', row.folder_id),
    kind: 'drive',
    name: row.folder_name ?? row.root_label,
    place: placeOfDrive(row),
    count: row.total,
    coverItemId: row.cover_item_id,
    coverRev: row.cover_rev,
    latestAt: row.latest_at,
  };
}

function originFolder(row: z.output<typeof ORIGIN_ROW>): ListedFolder {
  return {
    key: row.folder_key,
    kind: photoFolderKindOf(row.folder_key),
    name: row.name,
    place: [...row.devices].sort().join(', '),
    count: row.total,
    coverItemId: row.cover_item_id,
    coverRev: row.cover_rev,
    latestAt: row.latest_at,
  };
}

export function listFolders(sql: Sql, actor: DriveActor): readonly ListedFolder[] {
  const parameters = visibility(actor);
  const drive = sql.all(DRIVE_ROW, DRIVE_FOLDERS, parameters).map(driveFolder);
  const origins = sql.all(ORIGIN_ROW, ORIGIN_FOLDERS, parameters).map(originFolder);
  return [...origins, ...drive].sort(
    (left, right) =>
      Date.parse(right.latestAt ?? '') - Date.parse(left.latestAt ?? '') ||
      left.key.localeCompare(right.key),
  );
}
