import { COLUMN_TYPES } from './core-tables';

const { BOOLEAN, JSON_ARRAY, JSON_OBJECT, NAMED } = COLUMN_TYPES;

export const MEDIA_TABLES: readonly string[] = [
  `create table cameras (
    device_id text primary key references devices (id) on delete cascade,
    stream_name text not null unique,
    source_url_kind text not null,
    ${BOOLEAN('physical_ptz')} default 0,
    ${BOOLEAN('two_way_audio')} default 0,
    ${BOOLEAN('record_events')} default 1
  ) strict`,
  `create table recordings (
    id text primary key,
    device_id text not null references devices (id) on delete cascade,
    event_id text references events (id) on delete set null,
    kind text not null check (kind in ('snapshot', 'clip')),
    storage_path text not null unique,
    started_at text not null,
    duration_ms integer check (duration_ms >= 0),
    bytes integer not null check (bytes >= 0),
    created_at text not null
  ) strict`,
  'create index recordings_device_idx on recordings (device_id, started_at)',
  'create index recordings_time_idx on recordings (started_at)',
  `create table ir_remotes (
    id text primary key,
    blaster_id text not null references devices (id) on delete cascade,
    ${NAMED('name', 80)},
    category text not null,
    brand text,
    created_at text not null,
    unique (blaster_id, name)
  ) strict`,
  `create table ir_codes (
    id text primary key,
    remote_id text not null references ir_remotes (id) on delete cascade,
    ${NAMED('button', 60)},
    format text not null check (format in ('pulses', 'head_key', 'library')),
    code text not null,
    created_at text not null,
    unique (remote_id, button)
  ) strict`,
  `create table scenes (
    id text primary key,
    ${NAMED('name', 80)} unique,
    icon text not null default 'sparkles',
    ${JSON_ARRAY('actions')},
    position integer not null default 0 check (position >= 0),
    created_at text not null
  ) strict`,
  `create table automations (
    id text primary key,
    ${NAMED('name', 80)} unique,
    ${BOOLEAN('enabled')} default 1,
    ${JSON_OBJECT('definition')},
    last_run_at text,
    last_error text,
    run_count integer not null default 0 check (run_count >= 0),
    created_at text not null,
    updated_at text not null
  ) strict`,
  `create table layouts (
    client_id text not null references clients (id) on delete cascade,
    page text not null check (length(page) between 1 and 40),
    ${JSON_OBJECT('layout')},
    updated_at text not null,
    primary key (client_id, page)
  ) strict, without rowid`,
  `create table push_targets (
    token text primary key,
    client_id text not null references clients (id) on delete cascade,
    platform text not null check (platform in ('android')),
    created_at text not null
  ) strict`,
];

export const ACCESS_TABLES: readonly string[] = [
  `create table health_sources (
    id text primary key,
    client_id text references clients (id) on delete set null,
    ${NAMED('name', 80)},
    token_hash text not null unique,
    ${JSON_ARRAY('granted_types')},
    last_sync_at text,
    last_error text,
    created_at text not null,
    revoked_at text
  ) strict`,
  `create table health_records (
    record_id text primary key,
    record_type text not null,
    start_time text not null,
    end_time text,
    zone_offset_seconds integer,
    data text not null check (json_valid(data) and json_type(data) = 'object'),
    source_app text not null,
    last_modified text not null,
    ${BOOLEAN('deleted')} default 0,
    received_at text not null
  ) strict`,
  'create index health_records_series_idx on health_records (record_type, start_time)',
  'create index health_records_time_idx on health_records (start_time)',
  `create table health_daily (
    day text not null,
    metric text not null,
    value real not null,
    unit text not null,
    updated_at text not null,
    primary key (day, metric)
  ) strict, without rowid`,
  `create table mcp_tokens (
    id text primary key,
    ${NAMED('name', 80)},
    token_hash text not null unique,
    created_at text not null,
    last_used_at text,
    revoked_at text
  ) strict`,
  `create table oauth_clients (
    id text primary key,
    name text not null,
    uri text,
    logo_uri text,
    ${JSON_ARRAY('redirect_uris')},
    ${JSON_ARRAY('scopes')},
    created_at text not null,
    granted_at text,
    revoked_at text
  ) strict`,
];
