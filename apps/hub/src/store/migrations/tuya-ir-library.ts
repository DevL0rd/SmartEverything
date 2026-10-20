import { COLUMN_TYPES } from './core-tables';

const { NAMED } = COLUMN_TYPES;

const TUYA_LIBRARY_REMOTES =
  "select id from devices where provider = 'tuya' and kind = 'ir_remote'";

export const TUYA_IR_LIBRARY_STATEMENTS: readonly string[] = [
  `update settings set ir_remotes = (
    select coalesce(json_group_object(key, json(value)), '{}')
    from json_each(settings.ir_remotes)
    where key not in (${TUYA_LIBRARY_REMOTES})
  )`,
  "delete from devices where provider = 'tuya' and kind = 'ir_remote'",
  "delete from ir_codes where format = 'library'",
  `create table ir_codes_current (
    id text primary key,
    remote_id text not null references ir_remotes (id) on delete cascade,
    ${NAMED('button', 60)},
    format text not null check (format in ('pulses', 'head_key')),
    code text not null,
    created_at text not null,
    unique (remote_id, button)
  ) strict`,
  `insert into ir_codes_current (id, remote_id, button, format, code, created_at)
    select id, remote_id, button, format, code, created_at from ir_codes`,
  'drop table ir_codes',
  'alter table ir_codes_current rename to ir_codes',
];
