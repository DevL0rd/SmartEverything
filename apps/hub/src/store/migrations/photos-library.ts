import type { Migration } from './migration';

export const PHOTOS_LIBRARY_MIGRATION: Migration = {
  version: 200,
  name: 'photos-library',
  statements: [
    `create table drive_photo_library (
      item_id text primary key,
      root_id text not null references drive_roots (id) on delete cascade
    ) strict, without rowid`,
    `insert into drive_photo_library (item_id, root_id)
      select distinct i.id, i.root_id from drive_items i
      join drive_backup_assets a on a.item_id = i.id where a.state = 'verified'
      union select distinct t.item_id, t.root_id from drive_trash t
      join drive_backup_assets a on a.item_id = t.item_id where a.state = 'verified'`,
  ],
};
