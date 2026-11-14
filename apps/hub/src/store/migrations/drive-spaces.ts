import type { Migration } from './migration';

const FLAG = (column: string): string => `check (${column} in (0, 1))`;

const JSON_ARRAY = (column: string): string =>
  `check (json_valid(${column}) and json_type(${column}) = 'array')`;

const SHARE = (column: string): string => `check (${column} between 0 and 1)`;

const COUNT = (column: string): string => `check (${column} >= 0)`;

const LINKED_ROOTS = "select id from drive_roots where kind <> 'managed'";

const LINKED_ITEMS = `select id from drive_items where root_id in (${LINKED_ROOTS})`;

const LINKED_TRASHED = `select item_id from drive_trash where root_id in (${LINKED_ROOTS})`;

const LINKED_ANY = `${LINKED_ITEMS} union ${LINKED_TRASHED}`;

const UNLINKED_FOLDERS = [
  `create table drive_unlinked_folders (
    root_id text primary key,
    path text not null check (length(path) > 0),
    read_only integer not null ${FLAG('read_only')}
  ) strict, without rowid`,
  `insert into drive_unlinked_folders (root_id, path, read_only)
    select id, path, read_only from drive_roots where kind in ('folder', 'volume')`,
];

const PHOTO_LIBRARY = [
  `insert or ignore into drive_photo_library (item_id, root_id)
    select i.id, i.root_id from drive_items i join drive_roots r on r.id = i.root_id
    where r.in_photos = 1 and i.kind in ('image', 'video')`,
];

const STARS = [
  `create table drive_stars (
    profile_id text not null references profiles (id) on delete cascade,
    item_id text not null references drive_items (id) on delete cascade,
    primary key (profile_id, item_id)
  ) strict, without rowid`,
  'create index drive_stars_by_item on drive_stars (item_id)',
  `insert into drive_stars (profile_id, item_id)
    select r.owner_profile_id, i.id from drive_items i join drive_roots r on r.id = i.root_id
    where i.starred = 1 and r.kind = 'managed' and r.scope = 'person'`,
  `insert into drive_stars (profile_id, item_id)
    select p.id, i.id from drive_items i join drive_roots r on r.id = i.root_id
    cross join profiles p
    where i.starred = 1 and r.kind = 'managed' and r.scope = 'home'`,
];

const GRANTS = [
  `create table drive_grants (
    id text primary key,
    item_id text not null,
    profile_id text not null references profiles (id) on delete cascade,
    role text not null check (role in ('view', 'edit')),
    granted_by text not null references profiles (id) on delete cascade,
    created_at text not null,
    unique (item_id, profile_id),
    check (profile_id <> granted_by)
  ) strict`,
  'create index drive_grants_by_profile on drive_grants (profile_id)',
  'create index drive_grants_by_granter on drive_grants (granted_by)',
];

const CHOSEN_CLIENTS = `select c.root_id, c.device_id, c.selected, c.need_bytes, c.last_seen_at, c.errors
  from drive_sync_clients c
  where not exists (
    select 1 from drive_sync_clients d
    where d.root_id = c.root_id and d.device_id = c.device_id
      and (coalesce(d.last_seen_at, '') > coalesce(c.last_seen_at, '')
        or (coalesce(d.last_seen_at, '') = coalesce(c.last_seen_at, '') and d.client_id > c.client_id)))`;

const EXCLUDED = `(
  select json_group_array(f.rel_path) from drive_items f
  where f.root_id = p.root_id and f.kind = 'folder'
    and json_array_length(c.selected) > 0
    and not exists (
      select 1 from json_each(c.selected) s
      where f.rel_path = s.value or substr(f.rel_path, 1, length(s.value) + 1) = s.value || '/')
    and not exists (
      select 1 from json_each(c.selected) s
      where substr(s.value, 1, length(f.rel_path) + 1) = f.rel_path || '/')
    and (f.parent_id is null or exists (
      select 1 from drive_items q join json_each(c.selected) s
        on substr(s.value, 1, length(q.rel_path) + 1) = q.rel_path || '/'
      where q.id = f.parent_id)))`;

const PLACEMENTS = [
  `create table drive_placements_new (
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
    reported_at text not null,
    check ((mode = 'synced') = (excluded is not null)),
    check ((mode = 'synced') = (ignore_patterns is not null)),
    check ((mode = 'synced') = (conflict_copies is not null))
  ) strict, without rowid`,
  `insert into drive_placements_new (id, device_id, root_id, folder_item_id, mode, local_path,
      enabled, hold, created_by, created_at, excluded, ignore_patterns, conflict_copies, state,
      tier, basic_limits, read_only, route, cache_bytes, pinned_bytes, open_files,
      pending_uploads, need_bytes, last_synced_at, errors, reason, reported_at)
    select p.id, p.device_id, p.root_id, p.folder_item_id, p.mode, p.local_path, p.enabled,
      p.hold, p.created_by, p.created_at,
      case when p.mode = 'synced' then coalesce(${EXCLUDED}, '[]') end,
      case when p.mode = 'synced'
        then coalesce(json_extract(r.sync, '$.ignorePatterns'), '[]') end,
      case when p.mode = 'synced'
        then coalesce(json_extract(r.sync, '$.conflictCopies'), 1) end,
      p.state, p.tier, p.basic_limits, p.read_only, p.route, p.cache_bytes, p.pinned_bytes,
      p.open_files, p.pending_uploads,
      case when p.mode = 'synced' then coalesce(c.need_bytes, 0) else 0 end,
      case when p.mode = 'synced' then c.last_seen_at end,
      case when p.mode = 'synced' then coalesce(c.errors, '[]') else '[]' end,
      p.reason, p.reported_at
    from drive_placements p
    join drive_roots r on r.id = p.root_id and r.kind = 'managed'
    left join (${CHOSEN_CLIENTS}) c on c.root_id = p.root_id and c.device_id = p.device_id`,
  'drop table drive_placements',
  'alter table drive_placements_new rename to drive_placements',
  `create unique index drive_placements_whole_root
    on drive_placements (device_id, root_id) where folder_item_id is null`,
  `create unique index drive_placements_folder
    on drive_placements (device_id, folder_item_id) where folder_item_id is not null`,
  'create index drive_placements_by_root on drive_placements (root_id)',
  `create index drive_placements_by_folder
    on drive_placements (folder_item_id) where folder_item_id is not null`,
];

const SYNC = [
  'drop table drive_sync_clients',
  'drop table drive_sync_ops',
  `create table drive_sync_ops (
    placement_id text not null references drive_placements (id) on delete cascade,
    op_id text not null check (length(op_id) > 0),
    result text not null check (json_valid(result) and json_type(result) = 'object'),
    at text not null,
    primary key (placement_id, op_id)
  ) strict, without rowid`,
  'create index drive_sync_ops_by_time on drive_sync_ops (at)',
];

const LINKED = [
  `delete from drive_share_events where share_id in
    (select id from drive_shares where item_id in (${LINKED_ANY}))`,
  `delete from drive_shares where item_id in (${LINKED_ANY})`,
  `delete from drive_upload_results where upload_id in
    (select id from drive_uploads where root_id in (${LINKED_ROOTS}))`,
  `delete from drive_uploads where root_id in (${LINKED_ROOTS})`,
  `delete from drive_album_items where item_id in (${LINKED_ITEMS})`,
  `update drive_albums set item_count = (
      select count(*) from drive_album_items a where a.album_id = drive_albums.id)
    where kind = 'manual'`,
  `update drive_albums set cover_item_id = null where cover_item_id in (${LINKED_ITEMS})`,
  `update drive_stacks set cover_item_id = null where cover_item_id in (${LINKED_ITEMS})`,
  `update drive_media set motion_clip_id = null where motion_clip_id in (${LINKED_ITEMS})`,
  `delete from drive_media where item_id in (${LINKED_ITEMS})`,
  `delete from drive_media_jobs where item_id in (${LINKED_ITEMS})`,
  `delete from drive_blocks where item_id in (${LINKED_ITEMS})`,
  `delete from drive_photo_old_folders where item_id in (${LINKED_ITEMS})`,
  `delete from drive_photo_relocations where item_id in (${LINKED_ITEMS})`,
  `delete from drive_photo_trash_folders where item_id in (${LINKED_TRASHED})`,
  `delete from drive_scrub where root_id in (${LINKED_ROOTS})`,
  `delete from drive_photo_library where root_id in (${LINKED_ROOTS})`,
  `delete from drive_conflicts where root_id in (${LINKED_ROOTS})`,
  `delete from drive_days where root_id in (${LINKED_ROOTS})`,
  `delete from drive_feed where root_id in (${LINKED_ROOTS})`,
  `delete from drive_intents where root_id in (${LINKED_ROOTS})`,
  `delete from drive_versions where root_id in (${LINKED_ROOTS})`,
  `delete from drive_trash where root_id in (${LINKED_ROOTS})`,
  `delete from drive_items_search where item_id in (${LINKED_ITEMS})`,
  `delete from drive_items where root_id in (${LINKED_ROOTS})`,
];

const ROOTS = [
  `create table drive_roots_new (
    id text primary key,
    scope text not null check (scope in ('home', 'person')),
    owner_profile_id text references profiles (id) on delete cascade,
    versions integer not null ${FLAG('versions')},
    index_id text not null check (length(index_id) > 0),
    state text not null check (state in ('scanning', 'ready', 'unresponsive', 'error')),
    state_reason text check (state_reason is null or length(state_reason) > 0),
    items integer not null ${COUNT('items')},
    folders integer not null ${COUNT('folders')},
    bytes integer not null ${COUNT('bytes')},
    scanned_at text,
    hashed_share real not null ${SHARE('hashed_share')},
    verified_share real not null ${SHARE('verified_share')},
    corrupt integer not null ${COUNT('corrupt')},
    last_scrub_at text,
    last_backup_at text,
    skip_patterns text not null ${JSON_ARRAY('skip_patterns')},
    include_hidden integer not null ${FLAG('include_hidden')},
    created_at text not null,
    updated_at text not null,
    check ((scope = 'person') = (owner_profile_id is not null))
  ) strict`,
  `insert into drive_roots_new (id, scope, owner_profile_id, versions, index_id, state,
      state_reason, items, folders, bytes, scanned_at, hashed_share, verified_share, corrupt,
      last_scrub_at, last_backup_at, skip_patterns, include_hidden, created_at, updated_at)
    select id, scope, owner_profile_id, 0, index_id,
      case state when 'offline' then 'error' else state end,
      case state when 'offline' then coalesce(state_reason, 'the drive folder was offline')
        else state_reason end,
      items, folders, bytes, scanned_at, hashed_share, verified_share, corrupt, last_scrub_at,
      last_backup_at, skip_patterns, include_hidden, created_at, updated_at
    from drive_roots where kind = 'managed'`,
  'drop table drive_roots',
  'alter table drive_roots_new rename to drive_roots',
  "create unique index drive_roots_shared on drive_roots (scope) where scope = 'home'",
  `create unique index drive_roots_by_owner
    on drive_roots (owner_profile_id) where owner_profile_id is not null`,
];

const STARRED_COLUMN = [
  'drop index drive_items_by_starred',
  'alter table drive_items drop column starred',
];

export const DRIVE_SPACES_MIGRATION: Migration = {
  version: 202,
  name: 'drive-spaces',
  foreignKeys: 'off',
  statements: [
    ...UNLINKED_FOLDERS,
    ...PHOTO_LIBRARY,
    ...STARS,
    ...GRANTS,
    ...PLACEMENTS,
    ...SYNC,
    ...LINKED,
    ...ROOTS,
    ...STARRED_COLUMN,
  ],
};
