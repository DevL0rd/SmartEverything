import type { Migration } from './migration';

const FLAG = (column: string): string => `check (${column} in (0, 1))`;

const JSON_ARRAY = (column: string): string =>
  `check (json_valid(${column}) and json_type(${column}) = 'array')`;

const COUNT = (column: string): string => `check (${column} >= 0)`;

const SLASHED = "replace(p.local_path, '\\', '/')";

const BASENAME = `replace(${SLASHED}, rtrim(${SLASHED}, replace(${SLASHED}, '/', '')), '')`;

export const DRIVE_MOUNT_LOCATION_MIGRATION: Migration = {
  version: 206,
  name: 'drive-mount-location',
  foreignKeys: 'off',
  statements: [
    `create table drive_placements_new (
      id text primary key,
      device_id text not null references devices (id) on delete cascade,
      root_id text not null references drive_roots (id) on delete cascade,
      folder_item_id text,
      mode text not null check (mode in ('synced', 'mounted')),
      local_path text check (local_path is null or length(local_path) > 0),
      mount_name text check (mount_name is null or length(mount_name) > 0),
      enabled integer not null ${FLAG('enabled')},
      hold text check (hold is null or hold in ('trashed', 'no_access', 'sync_off')),
      created_by text not null references profiles (id) on delete cascade,
      created_at text not null,
      excluded text ${JSON_ARRAY('excluded')},
      ignore_patterns text ${JSON_ARRAY('ignore_patterns')},
      conflict_copies integer ${FLAG('conflict_copies')},
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
      need_bytes integer not null ${COUNT('need_bytes')},
      last_synced_at text,
      errors text not null ${JSON_ARRAY('errors')},
      reason text check (reason is null or length(reason) > 0),
      mount_point text check (mount_point is null or length(mount_point) > 0),
      reported_at text not null,
      check ((mode = 'synced') = (excluded is not null)),
      check ((mode = 'synced') = (ignore_patterns is not null)),
      check ((mode = 'synced') = (conflict_copies is not null)),
      check ((mode = 'synced') = (local_path is not null)),
      check ((mode = 'mounted') = (mount_name is not null)),
      check (mode = 'mounted' or mount_point is null)
    ) strict, without rowid`,
    `insert into drive_placements_new (id, device_id, root_id, folder_item_id, mode, local_path,
        mount_name, enabled, hold, created_by, created_at, excluded, ignore_patterns,
        conflict_copies, state, tier, basic_limits, read_only, route, cache_bytes, pinned_bytes,
        open_files, pending_uploads, need_bytes, last_synced_at, errors, reason, mount_point,
        reported_at)
      select p.id, p.device_id, p.root_id, p.folder_item_id, p.mode,
        case when p.mode = 'synced' then p.local_path end,
        case when p.mode = 'mounted' then coalesce(nullif(${BASENAME}, ''), p.local_path) end,
        p.enabled, p.hold, p.created_by, p.created_at, p.excluded, p.ignore_patterns,
        p.conflict_copies, p.state, p.tier, p.basic_limits, p.read_only, p.route, p.cache_bytes,
        p.pinned_bytes, p.open_files, p.pending_uploads, p.need_bytes, p.last_synced_at, p.errors,
        p.reason, null, p.reported_at
      from drive_placements p`,
    'drop table drive_placements',
    'alter table drive_placements_new rename to drive_placements',
    `create unique index drive_placements_whole_root
      on drive_placements (device_id, root_id) where folder_item_id is null`,
    `create unique index drive_placements_folder
      on drive_placements (device_id, folder_item_id) where folder_item_id is not null`,
    'create index drive_placements_by_root on drive_placements (root_id)',
    `create index drive_placements_by_folder
      on drive_placements (folder_item_id) where folder_item_id is not null`,
  ],
};
