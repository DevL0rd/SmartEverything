export const APP_SESSION_TABLES: readonly string[] = [
  `create table app_sessions (
    id integer primary key,
    device_id text not null references devices (id) on delete cascade,
    app_id text not null,
    app_name text not null,
    started_at text not null,
    ended_at text not null,
    seconds real not null check (seconds >= 0)
  ) strict`,
  'create index app_sessions_device_idx on app_sessions (device_id, started_at)',
];
