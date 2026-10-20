export const TREADMILL_TABLES: readonly string[] = [
  `create table treadmill_sessions (
    id text primary key,
    device_id text not null references devices (id) on delete cascade,
    walker_profile_id text references profiles (id) on delete set null,
    started_at text not null,
    ended_at text,
    zone_offset_seconds integer not null,
    source text not null check (source in ('live', 'pad_summary', 'pad_record')),
    figures text not null check (json_valid(figures) and json_type(figures) = 'object')
  ) strict`,
  'create index treadmill_sessions_walker_idx on treadmill_sessions (device_id, walker_profile_id, started_at)',
  'create index treadmill_sessions_started_idx on treadmill_sessions (started_at)',
  `create table treadmill_samples (
    session_id text not null references treadmill_sessions (id) on delete cascade,
    t_s integer not null check (t_s >= 0),
    speed_cmh integer not null check (speed_cmh >= 0),
    distance_m integer not null check (distance_m >= 0),
    steps integer,
    state text not null check (state in ('running', 'paused')),
    primary key (session_id, t_s)
  ) strict, without rowid`,
];
