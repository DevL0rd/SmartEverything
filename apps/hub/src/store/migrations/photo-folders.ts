import type { Migration } from './migration';

const KEY = (column: string): string =>
  `check (${column} glob 'drive:?*' or ${column} glob 'phone:?*' or ${column} glob 'computer:?*')`;

const NAMED = (column: string): string => `check (length(trim(${column})) > 0)`;

export const PHOTO_FOLDERS_MIGRATION: Migration = {
  version: 212,
  name: 'photo-folders',
  statements: [
    `create table photo_hidden_folders (
      profile_id text not null references profiles (id) on delete cascade,
      folder_key text not null ${KEY('folder_key')},
      name text not null ${NAMED('name')},
      hidden_at text not null,
      primary key (profile_id, folder_key)
    ) strict, without rowid`,
    `create table photo_asset_folders (
      backup_device_id text not null,
      local_id text not null,
      folder_key text not null ${KEY('folder_key')}
        check (folder_key not glob 'drive:*'),
      folder_name text not null ${NAMED('folder_name')},
      primary key (backup_device_id, local_id),
      foreign key (backup_device_id, local_id)
        references drive_backup_assets (backup_device_id, local_id) on delete cascade
    ) strict, without rowid`,
    'create index photo_asset_folders_by_key on photo_asset_folders (folder_key)',
  ],
};
