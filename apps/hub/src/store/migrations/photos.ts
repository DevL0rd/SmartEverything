import type { Migration } from './migration';

const FLAG = (column: string): string => `check (${column} in (0, 1))`;

const JSON_OBJECT = (column: string): string =>
  `check (json_valid(${column}) and json_type(${column}) = 'object')`;

const COUNT = (column: string): string => `check (${column} >= 0)`;

const DERIVED_STATE = (column: string): string =>
  `check (${column} in ('none', 'ready', 'failed', 'unsupported'))`;

const SHA256 = (column: string): string =>
  `check (length(${column}) = 64 and ${column} not glob '*[^0-9a-f]*')`;

const PLACES = [
  `create table drive_places (
    id text primary key check (length(id) > 0),
    name text not null check (length(trim(name)) > 0),
    admin text check (admin is null or length(admin) > 0),
    country text not null check (length(country) = 2 and country not glob '*[^A-Z]*'),
    lat real not null check (lat between -90 and 90),
    lon real not null check (lon between -180 and 180)
  ) strict`,
  'create index drive_places_by_country on drive_places (country, name)',
  'create index drive_places_by_position on drive_places (lat, lon)',
];

const STACKS = [
  `create table drive_stacks (
    id text primary key,
    kind text not null check (kind in ('burst', 'stem')),
    cover_item_id text references drive_items (id) on delete set null
  ) strict`,
  'create index drive_stacks_by_cover on drive_stacks (cover_item_id)',
];

const MEDIA = [
  `create table drive_media (
    item_id text primary key references drive_items (id) on delete cascade,
    time_source text not null check (time_source in ('metadata', 'container', 'filename', 'modified', 'manual')),
    tz_offset_min integer check (tz_offset_min is null or tz_offset_min between -1440 and 1440),
    thumbhash blob check (thumbhash is null or length(thumbhash) > 0),
    preview_state text not null ${DERIVED_STATE('preview_state')},
    preview_reason text check (preview_reason is null or length(preview_reason) > 0),
    poster_state text not null ${DERIVED_STATE('poster_state')},
    poster_reason text check (poster_reason is null or length(poster_reason) > 0),
    playable_state text not null ${DERIVED_STATE('playable_state')},
    playable_reason text check (playable_reason is null or length(playable_reason) > 0),
    motion_clip_id text references drive_items (id) on delete set null,
    live_id text check (live_id is null or length(live_id) > 0),
    burst_id text check (burst_id is null or length(burst_id) > 0),
    stem_key text check (stem_key is null or length(stem_key) > 0),
    stack_id text references drive_stacks (id) on delete set null,
    place_id text references drive_places (id) on delete set null,
    check ((preview_state in ('failed', 'unsupported')) = (preview_reason is not null)),
    check ((poster_state in ('failed', 'unsupported')) = (poster_reason is not null)),
    check ((playable_state in ('failed', 'unsupported')) = (playable_reason is not null))
  ) strict`,
  'create index drive_media_by_place on drive_media (place_id) where place_id is not null',
  'create index drive_media_by_stack on drive_media (stack_id) where stack_id is not null',
  'create index drive_media_by_live on drive_media (live_id) where live_id is not null',
  'create index drive_media_by_burst on drive_media (burst_id) where burst_id is not null',
  'create index drive_media_by_stem on drive_media (stem_key) where stem_key is not null',
  'create index drive_media_by_clip on drive_media (motion_clip_id) where motion_clip_id is not null',
];

const JOBS = [
  `create table drive_media_jobs (
    id text primary key,
    kind text not null check (length(kind) > 0),
    item_id text not null references drive_items (id) on delete cascade,
    rev integer not null check (rev > 0),
    state text not null check (state in ('queued', 'running', 'done', 'failed')),
    visible integer not null ${FLAG('visible')},
    attempts integer not null ${COUNT('attempts')},
    progress real check (progress is null or progress between 0 and 1),
    error text check (error is null or length(error) > 0),
    model_version text check (model_version is null or length(model_version) > 0),
    queued_at text not null,
    unique (item_id, rev, kind),
    check (state <> 'failed' or error is not null)
  ) strict`,
  "create index drive_media_jobs_by_queue on drive_media_jobs (visible desc, queued_at, id) where state = 'queued'",
  "create index drive_media_jobs_by_state on drive_media_jobs (state, kind) where state <> 'done'",
];

const BACKUP_DEVICES = [
  `create table drive_backup_devices (
    id text primary key,
    profile_id text not null references profiles (id) on delete cascade,
    device_id text not null unique references devices (id) on delete cascade,
    name text not null check (length(trim(name)) > 0),
    platform text not null check (platform in ('android', 'ios')),
    last_seen_at text,
    settings text not null ${JSON_OBJECT('settings')}
  ) strict`,
  'create index drive_backup_devices_by_profile on drive_backup_devices (profile_id, name)',
];

const BACKUP_ASSETS = [
  `create table drive_backup_assets (
    backup_device_id text not null references drive_backup_devices (id) on delete cascade,
    local_id text not null check (length(local_id) > 0),
    item_id text check (item_id is null or length(item_id) > 0),
    sha256 text not null ${SHA256('sha256')},
    state text not null check (state in ('uploading', 'uploaded', 'verified', 'failed')),
    at text not null,
    primary key (backup_device_id, local_id),
    check (state not in ('uploaded', 'verified') or item_id is not null)
  ) strict, without rowid`,
  'create index drive_backup_assets_by_state on drive_backup_assets (backup_device_id, state)',
  'create index drive_backup_assets_by_sha256 on drive_backup_assets (sha256)',
  'create index drive_backup_assets_by_item on drive_backup_assets (item_id) where item_id is not null',
];

export const PHOTOS_MIGRATION: Migration = {
  version: 183,
  name: 'photos',
  statements: [...PLACES, ...STACKS, ...MEDIA, ...JOBS, ...BACKUP_DEVICES, ...BACKUP_ASSETS],
};
