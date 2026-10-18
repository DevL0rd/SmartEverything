import { COLUMN_TYPES } from './core-tables';

const { JSON_ARRAY, NAMED } = COLUMN_TYPES;

export const HEALTH_SOURCES_BY_CLIENT_STATEMENTS: readonly string[] = [
  `create table health_sources_next (
    client_id text primary key references clients (id) on delete cascade,
    ${NAMED('name', 80)},
    ${JSON_ARRAY('granted_types')},
    last_sync_at text,
    last_error text,
    created_at text not null
  ) strict`,
  `insert into health_sources_next (client_id, name, granted_types, last_sync_at, last_error, created_at)
   select client_id, name, granted_types, last_sync_at, last_error, created_at from (
     select client_id, name, granted_types, last_sync_at, last_error, created_at,
       row_number() over (
         partition by client_id
         order by last_sync_at is null, last_sync_at desc, created_at desc
       ) as place
     from health_sources
     where client_id is not null and revoked_at is null
   ) where place = 1`,
  `create table health_entry_writes_next (
    entry_id text not null references health_entries (id) on delete cascade,
    source_id text not null references clients (id) on delete cascade,
    version integer not null check (version >= 1),
    written_at text not null,
    primary key (entry_id, source_id)
  ) strict, without rowid`,
  `insert into health_entry_writes_next (entry_id, source_id, version, written_at)
   select w.entry_id, s.client_id, max(w.version), w.written_at
   from health_entry_writes w join health_sources s on s.id = w.source_id
   where s.client_id is not null
   group by w.entry_id, s.client_id`,
  `create table health_entry_failures_next (
    entry_id text not null references health_entries (id) on delete cascade,
    source_id text not null references clients (id) on delete cascade,
    version integer not null check (version >= 1),
    reason text not null check (length(reason) between 1 and 500),
    failed_at text not null,
    primary key (entry_id, source_id)
  ) strict, without rowid`,
  `insert into health_entry_failures_next (entry_id, source_id, version, reason, failed_at)
   select f.entry_id, s.client_id, f.version, f.reason, max(f.failed_at)
   from health_entry_failures f join health_sources s on s.id = f.source_id
   where s.client_id is not null
   group by f.entry_id, s.client_id`,
  `create table body_reading_writes_next (
    reading_id text not null references body_readings (id) on delete cascade,
    source_id text not null references clients (id) on delete cascade,
    version integer not null check (version >= 1),
    written_at text not null,
    primary key (reading_id, source_id)
  ) strict, without rowid`,
  `insert into body_reading_writes_next (reading_id, source_id, version, written_at)
   select w.reading_id, s.client_id, max(w.version), w.written_at
   from body_reading_writes w join health_sources s on s.id = w.source_id
   where s.client_id is not null
   group by w.reading_id, s.client_id`,
  'drop table health_entry_writes',
  'drop table health_entry_failures',
  'drop table body_reading_writes',
  'drop table health_sources',
  'alter table health_sources_next rename to health_sources',
  'alter table health_entry_writes_next rename to health_entry_writes',
  'alter table health_entry_failures_next rename to health_entry_failures',
  'alter table body_reading_writes_next rename to body_reading_writes',
];
