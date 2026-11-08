import type { Migration } from './migration';

export const RUNTIME_LOGS_MIGRATION: Migration = {
  version: 164,
  name: 'runtime-logs',
  statements: [
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
      recorded_at text not null
    ) strict`,
    'create index runtime_logs_at_level on runtime_logs (at, level)',
    'create unique index runtime_logs_once on runtime_logs (source, client_id, at, event, scope, payload) where client_id is not null',
    'create index runtime_logs_component on runtime_logs (component, at)',
    'create index runtime_logs_signature on runtime_logs (signature, at)',
    'create index runtime_logs_device on runtime_logs (device_id, at)',
    `create virtual table runtime_logs_search using fts5(
      scope, event, payload, failure,
      content = 'runtime_logs', content_rowid = 'id', tokenize = 'unicode61 remove_diacritics 2'
    )`,
    `create trigger runtime_logs_search_after AFTER INSERT on runtime_logs begin
      insert into runtime_logs_search (rowid, scope, event, payload, failure)
      values (new.id, new.scope, new.event, new.payload, coalesce(new.failure, ''));
    end`,
    `create trigger runtime_logs_search_delete AFTER DELETE on runtime_logs begin
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
    `create table runtime_log_footprint (
      key text primary key check (length(key) between 1 and 80),
      bytes integer not null check (bytes >= 0),
      measured_at text not null
    ) strict`,
  ],
};
