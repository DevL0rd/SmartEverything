export const BOTTLE_TABLES: readonly string[] = [
  `create table bottle_readings (
    device_id text not null references devices (id) on delete cascade,
    at integer not null,
    trigger_type text not null,
    distance_mm integer not null,
    kcps integer not null,
    led_ohm real not null,
    verdict text not null check (verdict in ('accepted', 'out_of_range', 'weak', 'slosh', 'clock_invalid')),
    volume_ml integer,
    kind text not null check (kind in ('seed', 'small', 'drink', 'fill', 'rejected')),
    event_ml integer,
    drunk_ml integer,
    primary key (device_id, at, trigger_type, distance_mm)
  ) strict, without rowid`,
  `create table bottle_drinks (
    device_id text not null references devices (id) on delete cascade,
    at integer not null,
    kind text not null check (kind in ('drink', 'fill')),
    ml integer not null,
    level_ml integer,
    profile_id text references profiles (id) on delete set null,
    entry_id text,
    primary key (device_id, at, kind)
  ) strict, without rowid`,
  'create index bottle_drinks_profile_idx on bottle_drinks (profile_id, at)',
  `create table bottle_uv_cycles (
    device_id text not null references devices (id) on delete cascade,
    at integer not null,
    mode text not null,
    soc_pct integer not null,
    primary key (device_id, at)
  ) strict, without rowid`,
  `create table bottle_faults (
    device_id text not null references devices (id) on delete cascade,
    at integer not null,
    type text not null,
    primary key (device_id, at, type)
  ) strict, without rowid`,
  `create table bottle_battery (
    device_id text not null references devices (id) on delete cascade,
    at integer not null,
    pct integer not null check (pct between 0 and 100),
    source text not null check (source in ('read', 'notify', 'uv_cycle')),
    primary key (device_id, at, source)
  ) strict, without rowid`,
  `create table bottle_state_log (
    device_id text not null references devices (id) on delete cascade,
    at integer not null,
    hall integer not null,
    bottle integer not null,
    ambient integer not null,
    sip integer not null,
    bottle_value real not null,
    ambient_value real not null,
    sip_value real not null,
    primary key (device_id, at)
  ) strict, without rowid`,
  `create table bottle_adc (
    device_id text not null references devices (id) on delete cascade,
    kind text not null check (kind in ('activation', 'charging')),
    at integer not null,
    battery_volt real not null,
    battery_ohm real not null,
    uv_volt real not null,
    uv_ma real not null,
    uv_ohm real not null,
    pcb_ohm real not null,
    primary key (device_id, kind, at)
  ) strict, without rowid`,
  `create table bottle_snapshots (
    device_id text not null references devices (id) on delete cascade,
    kind text not null,
    at text not null,
    value text not null check (json_valid(value)),
    primary key (device_id, kind)
  ) strict, without rowid`,
  `create table bottle_syncs (
    device_id text not null references devices (id) on delete cascade,
    started_at text not null,
    ended_at text not null,
    cause text not null,
    outcome text not null,
    detail text,
    requests integer not null,
    answered integer not null,
    rssi integer,
    client_id text,
    primary key (device_id, started_at)
  ) strict, without rowid`,
  'alter table health_entries add column source text',
  'alter table health_entries add column source_key text',
  `create unique index health_entries_source_key_idx
    on health_entries (profile_id, source_key) where source_key is not null`,
];
