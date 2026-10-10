import { COLUMN_TYPES } from './core-tables';

const { JSON_ARRAY } = COLUMN_TYPES;

export const WATCH_TABLES: readonly string[] = [
  `create table watch_days (
    profile_id text not null references profiles (id) on delete cascade,
    device_id text not null references devices (id) on delete cascade,
    day text not null,
    kind text not null check (kind in ('stress', 'vitality')),
    ${JSON_ARRAY('samples')},
    updated_at text not null,
    primary key (profile_id, device_id, day, kind)
  ) strict, without rowid`,
];
