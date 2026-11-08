import type { Migration } from './migration';

const FLAG = (column: string): string => `check (${column} in (0, 1))`;

const COUNT = (column: string): string => `check (${column} >= 0)`;

export const DRIVE_PLACEMENTS_MIGRATION: Migration = {
  version: 192,
  name: 'drive-placements',
  statements: [
    `create table drive_placements (
      id text primary key,
      device_id text not null references devices (id) on delete cascade,
      root_id text not null references drive_roots (id) on delete cascade,
      folder_item_id text,
      mode text not null check (mode in ('synced', 'mounted')),
      local_path text not null check (length(local_path) > 0),
      enabled integer not null ${FLAG('enabled')},
      hold text check (hold is null or hold in ('trashed', 'no_access', 'sync_off')),
      created_by text not null references profiles (id) on delete cascade,
      created_at text not null,
      state text not null check (state in
        ('starting', 'mounted', 'syncing', 'up_to_date', 'offline', 'stopped', 'failed', 'blocked')),
      tier text check (tier is null or tier in ('full', 'basic')),
      basic_limits text check (basic_limits is null
        or (json_valid(basic_limits) and json_type(basic_limits) = 'object')),
      read_only integer not null ${FLAG('read_only')},
      route text check (route is null or route in ('local', 'remote')),
      cache_bytes integer not null ${COUNT('cache_bytes')},
      pinned_bytes integer not null ${COUNT('pinned_bytes')},
      open_files integer not null ${COUNT('open_files')},
      pending_uploads integer not null ${COUNT('pending_uploads')},
      reason text check (reason is null or length(reason) > 0),
      reported_at text not null,
      check (mode = 'mounted' or folder_item_id is null)
    ) strict, without rowid`,
    `create unique index drive_placements_whole_root
      on drive_placements (device_id, root_id) where folder_item_id is null`,
    `create unique index drive_placements_folder
      on drive_placements (device_id, folder_item_id) where folder_item_id is not null`,
    'create index drive_placements_by_root on drive_placements (root_id)',
    'create index drive_placements_by_folder on drive_placements (folder_item_id) where folder_item_id is not null',
  ],
};
