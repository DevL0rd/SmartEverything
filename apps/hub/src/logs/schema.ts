import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';

const LOG_BUSY_TIMEOUT_MS = 5000;

const LOG_SCHEMA: readonly (readonly string[])[] = [
  [
    `create table runtime_logs (
      id integer primary key,
      at text not null check (length(at) between 20 and 30),
      source text not null check (length(source) between 1 and 80),
      runtime text not null check (runtime in ('app', 'edge', 'db', 'tool', 'hub', 'desktop')),
      platform text not null check (platform in ('android', 'ios', 'web', 'server')),
      device_id text,
      client_id text,
      component text not null check (length(component) between 1 and 120),
      level text not null check (level in ('trace', 'debug', 'info', 'warn', 'error', 'exception')),
      scope text not null check (length(scope) between 1 and 120),
      event text not null check (length(event) between 1 and 120),
      payload text not null check (json_valid(payload) and json_type(payload) = 'object'),
      failure text check (failure is null or (json_valid(failure) and json_type(failure) = 'object')),
      signature text check (signature is null or length(signature) between 1 and 64),
      duration_ms integer check (duration_ms is null or duration_ms >= 0),
      recorded_at text not null,
      release text check (release is null or length(release) between 1 and 40),
      bundle text check (bundle is null or length(bundle) between 1 and 40)
    ) strict`,
    'create index runtime_logs_at_level on runtime_logs (at, level)',
    'create index runtime_logs_once on runtime_logs (source, at, event, scope)',
    'create index runtime_logs_component on runtime_logs (component, at)',
    'create index runtime_logs_signature on runtime_logs (signature, at)',
    'create index runtime_logs_device on runtime_logs (device_id, at)',
    'create index runtime_logs_runtime_at on runtime_logs (runtime, at desc, id desc)',
    `create virtual table runtime_logs_search using fts5(
      scope, event, payload, failure,
      content = 'runtime_logs', content_rowid = 'id', tokenize = 'unicode61 remove_diacritics 2'
    )`,
    `create trigger runtime_logs_search_after after insert on runtime_logs begin
      insert into runtime_logs_search (rowid, scope, event, payload, failure)
      values (new.id, new.scope, new.event, new.payload, coalesce(new.failure, ''));
    end`,
    `create trigger runtime_logs_search_delete after delete on runtime_logs begin
      insert into runtime_logs_search (runtime_logs_search, rowid, scope, event, payload, failure)
      values ('delete', old.id, old.scope, old.event, old.payload, coalesce(old.failure, ''));
    end`,
    `create table runtime_log_sources (
      source text not null check (length(source) between 1 and 80),
      runtime text not null check (runtime in ('app', 'edge', 'db', 'tool', 'hub', 'desktop')),
      platform text not null check (platform in ('android', 'ios', 'web', 'server')),
      device_id text,
      client_id text,
      first_at text not null,
      last_at text not null,
      records integer not null default 0 check (records >= 0),
      dropped integer not null default 0 check (dropped >= 0),
      primary key (source, client_id)
    ) strict`,
    `create table runtime_log_gaps (
      source text not null,
      client_id text,
      first_at text not null,
      last_at text not null,
      recorded_at text not null,
      primary key (source, first_at, last_at)
    ) strict`,
    'create index runtime_log_gaps_recorded on runtime_log_gaps (recorded_at)',
  ],
];

const USER_VERSION = z.object({ user_version: z.int().nonnegative() });

class LogSchemaTooNewError extends Error {
  override readonly name = 'LogSchemaTooNewError';

  constructor(found: number) {
    super(
      `The runtime log database is at version ${String(found)}, but this Hub only knows up to ${String(LOG_SCHEMA.length)}.`,
    );
  }
}

function migrateLogs(database: DatabaseSync): void {
  const found = USER_VERSION.parse(database.prepare('pragma user_version').get()).user_version;
  if (found > LOG_SCHEMA.length) throw new LogSchemaTooNewError(found);
  for (const [index, statements] of LOG_SCHEMA.entries()) {
    if (index < found) continue;
    database.exec('begin immediate');
    try {
      for (const statement of statements) database.exec(statement);
      database.exec(`pragma user_version = ${String(index + 1)}`);
      database.exec('commit');
    } catch (cause) {
      database.exec('rollback');
      throw cause;
    }
  }
}

export function openLogWriter(path: string): DatabaseSync {
  const database = new DatabaseSync(path);
  database.exec(`pragma busy_timeout = ${String(LOG_BUSY_TIMEOUT_MS)}`);
  database.exec('pragma journal_mode = wal');
  database.exec('pragma synchronous = normal');
  migrateLogs(database);
  return database;
}

export function openLogReader(path: string): DatabaseSync {
  const database = new DatabaseSync(path);
  database.exec(`pragma busy_timeout = ${String(LOG_BUSY_TIMEOUT_MS)}`);
  database.exec('pragma query_only = 1');
  return database;
}
