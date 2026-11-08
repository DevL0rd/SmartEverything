import type { Migration } from './migration';

export const PHOTOS_FOLDER_MIGRATION: Migration = {
  version: 201,
  name: 'photos-folder',
  statements: [
    `create table drive_photo_relocations (
      item_id text primary key references drive_items (id) on delete cascade,
      from_path text not null,
      mtime_ns text,
      to_path text
    ) strict, without rowid`,
    `create table drive_photo_old_folders (
      item_id text primary key references drive_items (id) on delete cascade
    ) strict, without rowid`,
    `insert into drive_photo_old_folders (item_id)
      select i.id from drive_items i join drive_roots r on r.id = i.root_id
      where r.kind = 'managed' and r.scope = 'person' and i.kind = 'folder'
        and (i.rel_path in ('Camera roll', 'Uploads')
          or i.rel_path glob 'Camera roll/*' or i.rel_path glob 'Uploads/*')`,
    `create table drive_photo_trash_folders (
      item_id text primary key references drive_trash (item_id) on delete cascade
    ) strict, without rowid`,
    `insert into drive_photo_trash_folders (item_id)
      select t.item_id from drive_trash t join drive_roots r on r.id = t.root_id
      where r.kind = 'managed' and r.scope = 'person' and t.is_folder = 0
        and (t.original_rel_path glob 'Camera roll/*' or t.original_rel_path glob 'Uploads/*')`,
    `insert into drive_photo_relocations (item_id, from_path)
      select i.id, i.rel_path from drive_items i join drive_roots r on r.id = i.root_id
      where r.kind = 'managed' and r.scope = 'person' and i.kind in ('image', 'video')
        and (i.rel_path glob 'Camera roll/*' or i.rel_path glob 'Uploads/*')`,
  ],
};
