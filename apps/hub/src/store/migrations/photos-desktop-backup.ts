import type { Migration } from './migration';

export const PHOTOS_DESKTOP_BACKUP_MIGRATION: Migration = {
  version: 199,
  name: 'photos-desktop-backup',
  foreignKeys: 'off',
  statements: [
    `create table drive_backup_devices_next (
      id text primary key,
      profile_id text not null references profiles (id) on delete cascade,
      device_id text not null unique references devices (id) on delete cascade,
      name text not null check (length(trim(name)) > 0),
      platform text not null check (platform in ('android', 'ios', 'desktop')),
      last_seen_at text,
      settings text not null check (json_valid(settings) and json_type(settings) = 'object')
    ) strict`,
    'insert into drive_backup_devices_next select * from drive_backup_devices',
    'drop table drive_backup_devices',
    'alter table drive_backup_devices_next rename to drive_backup_devices',
    'create index drive_backup_devices_by_profile on drive_backup_devices (profile_id, name)',
  ],
};
