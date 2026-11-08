import type { Migration } from './migration';

const FLAG = (column: string): string => `check (${column} in (0, 1))`;

const JSON_ARRAY = (column: string): string =>
  `check (json_valid(${column}) and json_type(${column}) = 'array')`;

const JSON_OBJECT = (column: string): string =>
  `check (json_valid(${column}) and json_type(${column}) = 'object')`;

const SHARE = (column: string): string => `check (${column} between 0 and 1)`;

const COUNT = (column: string): string => `check (${column} >= 0)`;

const ROOTS = `create table drive_roots (
  id text primary key,
  kind text not null check (kind in ('folder', 'volume', 'managed', 'cameras', 'ai_images')),
  label text not null check (length(trim(label)) > 0),
  scope text not null check (scope in ('home', 'person')),
  owner_profile_id text references profiles (id) on delete cascade,
  path text check (path is null or length(path) > 0),
  read_only integer not null ${FLAG('read_only')},
  versions integer not null ${FLAG('versions')},
  synced integer not null ${FLAG('synced')},
  index_id text not null check (length(index_id) > 0),
  state text not null check (state in ('scanning', 'ready', 'offline', 'unresponsive', 'error')),
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
  in_photos integer not null ${FLAG('in_photos')},
  skip_patterns text not null ${JSON_ARRAY('skip_patterns')},
  include_hidden integer not null ${FLAG('include_hidden')},
  volume text ${JSON_OBJECT('volume')},
  sync text ${JSON_OBJECT('sync')},
  created_at text not null,
  updated_at text not null,
  check ((scope = 'person') = (owner_profile_id is not null)),
  check ((kind in ('folder', 'volume', 'managed')) = (path is not null)),
  check ((kind in ('folder', 'volume', 'managed')) or (read_only = 1 and versions = 0 and synced = 0 and sync is null and volume is null)),
  check (kind <> 'volume' or volume is not null),
  check (not (read_only = 1 and versions = 1)),
  check (kind <> 'managed' or read_only = 0),
  check ((synced = 1) = (sync is not null))
) strict`;

const ITEMS = `create table drive_items (
  id text primary key,
  root_id text not null references drive_roots (id) on delete cascade,
  parent_id text references drive_items (id) on delete cascade,
  rel_path text not null check (length(rel_path) > 0),
  name text not null check (length(name) > 0),
  kind text not null check (kind in ('folder', 'image', 'video', 'audio', 'document', 'other')),
  mime text check (mime is null or length(mime) > 0),
  bytes integer not null ${COUNT('bytes')},
  child_count integer ${COUNT('child_count')},
  sha256 text check (sha256 is null or (length(sha256) = 64 and sha256 not glob '*[^0-9a-f]*')),
  integrity text not null check (integrity in ('unknown', 'ok', 'corrupt')),
  dev text,
  ino text,
  modified_at text not null,
  added_at text not null,
  opened_at text,
  starred integer not null ${FLAG('starred')},
  rev integer not null check (rev > 0),
  etag text not null check (length(etag) > 0),
  outside integer not null ${FLAG('outside')},
  added_by_profile_id text references profiles (id) on delete set null,
  remote_id text check (remote_id is null or length(remote_id) > 0),
  remote_rev text check (remote_rev is null or length(remote_rev) > 0),
  thumb_state text not null check (thumb_state in ('none', 'ready', 'failed', 'unsupported')),
  thumb_reason text check (thumb_reason is null or length(thumb_reason) > 0),
  taken_at text,
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  orientation integer check (orientation is null or orientation between 1 and 8),
  camera_make text,
  camera_model text,
  camera_lens text,
  exposure_iso real check (exposure_iso is null or exposure_iso > 0),
  exposure_aperture real check (exposure_aperture is null or exposure_aperture > 0),
  exposure_shutter real check (exposure_shutter is null or exposure_shutter > 0),
  exposure_focal real check (exposure_focal is null or exposure_focal > 0),
  place_lat real check (place_lat is null or place_lat between -90 and 90),
  place_lon real check (place_lon is null or place_lon between -180 and 180),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  unique (root_id, rel_path),
  check ((kind = 'folder') = (child_count is not null)),
  check (kind <> 'folder' or (mime is null and sha256 is null and thumb_state = 'none')),
  check (kind = 'folder' or mime is not null),
  check (kind in ('image', 'video') or (width is null and height is null and orientation is null and camera_make is null and camera_model is null and camera_lens is null and exposure_iso is null and exposure_aperture is null and exposure_shutter is null and exposure_focal is null and place_lat is null and place_lon is null)),
  check (kind in ('image', 'video', 'audio') or taken_at is null),
  check (kind in ('video', 'audio') or duration_ms is null),
  check ((thumb_state in ('failed', 'unsupported')) = (thumb_reason is not null)),
  check ((place_lat is null) = (place_lon is null))
) strict`;

const ITEM_INDEXES = [
  'create index drive_items_by_parent on drive_items (root_id, parent_id, name)',
  'create index drive_items_by_adder on drive_items (added_by_profile_id)',
  "create index drive_items_by_taken on drive_items (taken_at desc) where kind in ('image', 'video', 'audio')",
  'create index drive_items_by_sha256 on drive_items (sha256) where sha256 is not null',
  'create index drive_items_by_starred on drive_items (starred) where starred = 1',
  'create index drive_items_by_opened on drive_items (opened_at desc) where opened_at is not null',
  'create index drive_items_by_added on drive_items (added_at desc)',
];

const SEARCH = `create virtual table drive_items_search using fts5(
  item_id unindexed, name, path, camera, albums, dates,
  tokenize = 'unicode61 remove_diacritics 2'
)`;

const ALBUMS = [
  `create table drive_albums (
    id text primary key,
    title text not null check (length(trim(title)) > 0),
    kind text not null check (kind in ('manual', 'smart')),
    rule text ${JSON_OBJECT('rule')},
    surface text not null check (surface in ('photos', 'drive')),
    scope text not null check (scope in ('home', 'person')),
    owner_profile_id text references profiles (id) on delete cascade,
    cover_item_id text references drive_items (id) on delete set null,
    item_count integer not null ${COUNT('item_count')},
    created_at text not null,
    updated_at text not null,
    check ((kind = 'smart') = (rule is not null)),
    check ((scope = 'person') = (owner_profile_id is not null))
  ) strict`,
  'create index drive_albums_by_owner on drive_albums (surface, owner_profile_id, title)',
  `create table drive_album_items (
    album_id text not null references drive_albums (id) on delete cascade,
    item_id text not null references drive_items (id) on delete cascade,
    position real not null,
    added_at text not null,
    primary key (album_id, item_id)
  ) strict, without rowid`,
  'create index drive_album_items_by_position on drive_album_items (album_id, position)',
  'create index drive_album_items_by_item on drive_album_items (item_id)',
];

const TRASH = [
  `create table drive_trash (
    item_id text primary key,
    root_id text not null references drive_roots (id) on delete cascade,
    name text not null check (length(name) > 0),
    original_rel_path text not null check (length(original_rel_path) > 0),
    trash_rel_path text not null check (length(trash_rel_path) > 0),
    is_folder integer not null ${FLAG('is_folder')},
    bytes integer not null ${COUNT('bytes')},
    deleted_at text not null,
    purge_at text not null,
    deleted_by text references profiles (id) on delete set null,
    added_by_profile_id text references profiles (id) on delete set null,
    check (purge_at > deleted_at)
  ) strict`,
  'create index drive_trash_by_root on drive_trash (root_id, deleted_at desc)',
  'create index drive_trash_by_purge on drive_trash (purge_at)',
  'create index drive_trash_by_adder on drive_trash (added_by_profile_id)',
];

const DAYS = `create table drive_days (
  day text not null check (day glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  root_id text not null references drive_roots (id) on delete cascade,
  items integer not null ${COUNT('items')},
  bytes integer not null ${COUNT('bytes')},
  added integer not null ${COUNT('added')},
  removed integer not null ${COUNT('removed')},
  primary key (root_id, day)
) strict, without rowid`;

const FEED = [
  `create table drive_feed (
    seq integer primary key autoincrement,
    root_id text not null references drive_roots (id) on delete cascade,
    item_id text not null,
    op text not null check (op in ('create', 'update', 'rename', 'move', 'star', 'unstar', 'trash', 'restore', 'delete')),
    rev integer not null check (rev > 0),
    at text not null,
    actor_profile_id text references profiles (id) on delete set null,
    via text not null check (via in ('app', 'ai', 'automation', 'mount', 'sync', 'scan', 'share', 'outside')),
    device_id text,
    check (via not in ('scan', 'outside') or actor_profile_id is null),
    check (via not in ('mount', 'sync') or device_id is not null)
  ) strict`,
  'create index drive_feed_by_root on drive_feed (root_id, seq)',
  'create index drive_feed_by_item on drive_feed (item_id, seq)',
];

export const DRIVE_MIGRATION: Migration = {
  version: 181,
  name: 'drive',
  statements: [ROOTS, ITEMS, ...ITEM_INDEXES, SEARCH, ...ALBUMS, ...TRASH, DAYS, ...FEED],
};
