export const TOOTHBRUSH_TABLES: readonly string[] = [
  `create table brushing_sessions (
    id text primary key,
    device_id text not null references devices (id) on delete cascade,
    person_id text references profiles (id) on delete set null,
    handle_session_id integer,
    started_at text not null,
    zone_offset_seconds integer not null,
    duration_s real not null,
    routine_s real not null,
    mode text,
    intensity text,
    source text not null check (source in ('retained', 'observed')),
    complete integer not null check (complete in (0, 1)),
    pressure text check (pressure is null or json_valid(pressure)),
    zones text not null check (json_valid(zones) and json_type(zones) = 'array'),
    head_serial text
  ) strict`,
  'create unique index brushing_sessions_handle_idx on brushing_sessions (device_id, handle_session_id, started_at)',
  'create index brushing_sessions_person_idx on brushing_sessions (person_id, started_at)',
  'create index brushing_sessions_device_idx on brushing_sessions (device_id, started_at)',
  `create table brush_heads (
    device_id text not null references devices (id) on delete cascade,
    serial text not null,
    head_type text,
    first_seen text not null,
    last_seen text not null,
    first_usage_s integer not null,
    usage_s integer not null,
    limit_s integer not null,
    primary key (device_id, serial)
  ) strict, without rowid`,
];
