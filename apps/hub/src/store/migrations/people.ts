import {
  ACCENTS,
  CLIENT_PREFS,
  CLIENT_PREF_KEYS,
  FIRST_PROFILE_NAME,
  PROVIDERS,
  UNSET_FITNESS_GOALS,
} from '@smarteverything/domain';
import type { LogPayload } from '@smarteverything/logging';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { jsonText, type Sql } from '../sql';
import { COLUMN_TYPES } from './core-tables';

const { BOOLEAN, JSON_ARRAY, JSON_OBJECT, NAMED } = COLUMN_TYPES;

const listed = (values: readonly string[]): string =>
  values.map((value) => `'${value}'`).join(', ');

const CLIENT_PAGES = listed(
  CLIENT_PREF_KEYS.filter((key) => CLIENT_PREFS[key].scope === 'client').map(
    (key) => CLIENT_PREFS[key].storageKey,
  ),
);

export const PROFILE_TABLES: readonly string[] = [
  `create table profiles (
    id text primary key,
    ${NAMED('name', 40)},
    colour text not null check (colour in (${listed(ACCENTS)})),
    sex text check (sex in ('female', 'male')),
    birth_date text check (birth_date is null or date(birth_date) = birth_date),
    height_cm integer check (height_cm between 100 and 250),
    scale_user integer check (scale_user between 0 and 255),
    ${JSON_OBJECT('fitness_goals')},
    max_heart_rate integer check (max_heart_rate between 120 and 220),
    position integer not null default 0 check (position >= 0),
    created_at text not null,
    updated_at text not null
  ) strict`,
  'alter table clients add column profile_id text references profiles (id) on delete set null',
  `create table layouts_new (
    client_id text references clients (id) on delete cascade,
    profile_id text references profiles (id) on delete cascade,
    page text not null check (length(page) between 1 and 40),
    ${JSON_OBJECT('layout')},
    updated_at text not null,
    check ((client_id is null) <> (profile_id is null))
  ) strict`,
  'create unique index layouts_client_idx on layouts_new (client_id, page) where client_id is not null',
  'create unique index layouts_profile_idx on layouts_new (profile_id, page) where profile_id is not null',
  'alter table health_records add column profile_id text references profiles (id) on delete cascade',
  'create index health_records_profile_idx on health_records (profile_id, record_type, start_time)',
  `create table health_daily_new (
    profile_id text not null references profiles (id) on delete cascade,
    day text not null,
    metric text not null,
    value real not null,
    unit text not null,
    updated_at text not null,
    primary key (profile_id, day, metric)
  ) strict, without rowid`,
  `create table devices_new (
    id text primary key,
    provider text not null check (provider in (${listed(PROVIDERS)})),
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
  'insert into devices_new select * from devices',
  'drop table devices',
  'alter table devices_new rename to devices',
  'create index devices_room_idx on devices (room_id)',
  `create table local_devices (
    external_id text primary key,
    driver text not null,
    address text not null,
    ${NAMED('name', 120)},
    ${JSON_OBJECT('config')},
    created_at text not null
  ) strict`,
  `create table body_readings (
    id text primary key,
    device_id text not null references devices (id) on delete cascade,
    profile_id text references profiles (id) on delete cascade,
    measured_at text not null,
    weight_kg real,
    impedance_low real,
    impedance_high real,
    heart_rate integer,
    scale_user integer,
    attribution text not null,
    bmi real,
    composition text check (composition is null or json_valid(composition)),
    version integer not null default 1 check (version >= 1),
    created_at text not null,
    updated_at text not null,
    unique (device_id, measured_at)
  ) strict`,
  'create index body_readings_time_idx on body_readings (measured_at)',
  `create table body_reading_writes (
    reading_id text not null references body_readings (id) on delete cascade,
    source_id text not null references health_sources (id) on delete cascade,
    version integer not null check (version >= 1),
    written_at text not null,
    primary key (reading_id, source_id)
  ) strict, without rowid`,
];

const SETTINGS = z.object({ fitness_goals: z.string(), max_heart_rate: z.number().nullable() });

function moveLayouts(sql: Sql, profileId: string): void {
  sql.database.exec(
    `insert into layouts_new (client_id, profile_id, page, layout, updated_at)
     select client_id, null, page, layout, updated_at from layouts where page in (${CLIENT_PAGES})`,
  );
  sql.run(
    'move the shared layouts',
    `insert into layouts_new (client_id, profile_id, page, layout, updated_at)
     select null, $profileId, page, layout, max(updated_at) from layouts
     where page not in (${CLIENT_PAGES}) group by page`,
    { profileId },
  );
  sql.database.exec('drop table layouts');
  sql.database.exec('alter table layouts_new rename to layouts');
}

function moveHealth(sql: Sql, profileId: string): void {
  sql.run('own the health records', 'update health_records set profile_id = $profileId', {
    profileId,
  });
  sql.run(
    'own the daily figures',
    `insert into health_daily_new (profile_id, day, metric, value, unit, updated_at)
     select $profileId, day, metric, value, unit, updated_at from health_daily`,
    { profileId },
  );
  sql.database.exec('drop table health_daily');
  sql.database.exec('alter table health_daily_new rename to health_daily');
}

export function createFirstProfile(sql: Sql): LogPayload {
  const settings = sql.get(
    SETTINGS,
    'select fitness_goals, max_heart_rate from settings where id = 1',
  );
  const profileId = randomUUID();
  const now = new Date().toISOString();
  sql.run(
    'add the first profile',
    `insert into profiles (id, name, colour, fitness_goals, max_heart_rate, position, created_at, updated_at)
     values ($id, $name, 'amber', $goals, $maxHeartRate, 0, $now, $now)`,
    {
      id: profileId,
      name: FIRST_PROFILE_NAME,
      goals: settings?.fitness_goals ?? jsonText(UNSET_FITNESS_GOALS),
      maxHeartRate: settings?.max_heart_rate ?? null,
      now,
    },
  );
  sql.run('give every app the first profile', 'update clients set profile_id = $profileId', {
    profileId,
  });
  moveLayouts(sql, profileId);
  moveHealth(sql, profileId);
  return { profileId };
}
