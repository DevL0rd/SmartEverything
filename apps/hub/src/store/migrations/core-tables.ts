const BOOLEAN = (column: string): string =>
  `${column} integer not null check (${column} in (0, 1))`;

const JSON_ARRAY = (column: string): string =>
  `${column} text not null default '[]' check (json_valid(${column}) and json_type(${column}) = 'array')`;

const JSON_OBJECT = (column: string): string =>
  `${column} text not null default '{}' check (json_valid(${column}) and json_type(${column}) = 'object')`;

const NAMED = (column: string, longest: number): string =>
  `${column} text not null check (length(${column}) between 1 and ${String(longest)})`;

export const CORE_TABLES: readonly string[] = [
  `create table settings (
    id integer primary key check (id = 1),
    ${NAMED('home_name', 80)},
    time_zone text not null default 'UTC',
    latitude real check (latitude between -90 and 90),
    longitude real check (longitude between -180 and 180),
    public_url text,
    public_url_checked_at text,
    public_url_verified_at text,
    public_url_error text,
    ${JSON_ARRAY('ice_servers')},
    ${JSON_ARRAY('webrtc_candidates')},
    push_project_id text,
    updated_at text not null
  ) strict`,
  `create table clients (
    id text primary key,
    ${NAMED('name', 80)},
    platform text not null check (platform in ('desktop', 'android', 'web')),
    role text not null check (role in ('owner', 'member')),
    ${BOOLEAN('built_in')} default 0,
    token_hash text not null unique,
    created_at text not null,
    last_seen_at text
  ) strict`,
  `create table pairings (
    code_hash text primary key,
    role text not null check (role in ('owner', 'member')),
    created_by text references clients (id) on delete cascade,
    expires_at text not null,
    claimed_at text
  ) strict`,
  `create table provider_links (
    provider text primary key check (provider in ('xiaomi', 'tuya', 'smartthings', 'samsung_tv')),
    account_label text,
    status text not null default 'linking'
      check (status in ('linking', 'linked', 'needs_attention', 'unlinked')),
    prompt text check (prompt is null or (json_valid(prompt) and json_type(prompt) = 'object')),
    last_error text,
    device_count integer not null default 0 check (device_count >= 0),
    updated_at text not null
  ) strict`,
  `create table rooms (
    id text primary key,
    ${NAMED('name', 60)} unique,
    position integer not null default 0 check (position >= 0)
  ) strict`,
  `create table devices (
    id text primary key,
    provider text not null check (provider in ('xiaomi', 'tuya', 'smartthings', 'samsung_tv')),
    external_id text not null check (length(external_id) > 0),
    parent_id text references devices (id) on delete set null,
    kind text not null,
    ${NAMED('name', 120)},
    display_name text check (length(display_name) between 1 and 120),
    model text not null,
    manufacturer text not null,
    provider_room text,
    room_id text references rooms (id) on delete set null,
    ${BOOLEAN('online')} default 1,
    ${JSON_ARRAY('capabilities')},
    ${JSON_OBJECT('details')},
    ${BOOLEAN('hidden')} default 0,
    ${BOOLEAN('favourite')} default 0,
    position integer not null default 0 check (position >= 0),
    created_at text not null,
    updated_at text not null,
    unique (provider, external_id)
  ) strict`,
  'create index devices_room_idx on devices (room_id)',
  `create table device_state (
    device_id text not null references devices (id) on delete cascade,
    capability text not null,
    value text not null check (json_valid(value)),
    observed_at text not null,
    primary key (device_id, capability)
  ) strict, without rowid`,
  `create table state_history (
    id integer primary key autoincrement,
    device_id text not null references devices (id) on delete cascade,
    capability text not null,
    value text not null check (json_valid(value)),
    observed_at text not null
  ) strict`,
  'create index state_history_series_idx on state_history (device_id, capability, observed_at)',
  'create index state_history_capability_idx on state_history (capability, observed_at)',
  `create table commands (
    id text primary key,
    device_id text references devices (id) on delete cascade,
    capability text not null check (length(capability) > 0),
    value text not null default 'null' check (json_valid(value)),
    status text not null default 'pending'
      check (status in ('pending', 'running', 'succeeded', 'failed', 'expired')),
    source text not null default 'app' check (source in ('app', 'automation', 'scene', 'assistant')),
    result text not null default 'null' check (json_valid(result)),
    error text,
    requested_by text references clients (id) on delete set null,
    created_at text not null,
    started_at text,
    finished_at text,
    expires_at text not null
  ) strict`,
  'create index commands_open_idx on commands (status, created_at)',
  'create index commands_recent_idx on commands (created_at)',
  `create table events (
    id text primary key,
    device_id text references devices (id) on delete cascade,
    kind text not null,
    occurred_at text not null,
    ${JSON_OBJECT('details')},
    acknowledged_at text,
    created_at text not null
  ) strict`,
  'create index events_time_idx on events (occurred_at)',
  'create index events_device_idx on events (device_id, occurred_at)',
];

export const COLUMN_TYPES = { BOOLEAN, JSON_ARRAY, JSON_OBJECT, NAMED };
