import { COLUMN_TYPES } from './core-tables';

const { BOOLEAN, JSON_ARRAY, JSON_OBJECT } = COLUMN_TYPES;

export const PLUGIN_TABLES: readonly string[] = [
  `create table plugins (
    id text primary key check (length(id) between 2 and 32),
    ${JSON_OBJECT('manifest')},
    source text not null check (source in ('builtin', 'local', 'url')),
    location text check (location is null or length(location) between 1 and 1000),
    ${BOOLEAN('enabled')},
    ${BOOLEAN('trusted')},
    status text not null check (status in ('disabled', 'starting', 'running', 'crashed', 'needs_auth')),
    status_detail text check (status_detail is null or length(status_detail) <= 400),
    ${JSON_OBJECT('tool_switches')},
    ${JSON_OBJECT('settings')},
    ${JSON_ARRAY('secret_names')},
    icon_url text check (icon_url is null or length(icon_url) between 1 and 500),
    installed_at text not null,
    updated_at text not null
  ) strict`,
  `create table plugin_tokens (
    plugin_id text primary key references plugins (id) on delete cascade,
    token_hash text not null unique,
    ${JSON_ARRAY('areas')},
    created_at text not null
  ) strict`,
  `create table plugin_data (
    plugin_id text not null references plugins (id) on delete cascade,
    stream text not null check (length(stream) between 1 and 80),
    at text not null,
    value text not null check (json_valid(value))
  ) strict`,
  'create index plugin_data_by_stream on plugin_data (plugin_id, stream, at)',
  `create table plugin_records (
    plugin_id text not null references plugins (id) on delete cascade,
    collection text not null check (length(collection) between 1 and 80),
    key text not null check (length(key) between 1 and 200),
    value text not null check (json_valid(value)),
    updated_at text not null,
    primary key (plugin_id, collection, key)
  ) strict, without rowid`,
  `create table plugin_search (
    plugin_id text not null references plugins (id) on delete cascade,
    entry_id text not null check (length(entry_id) between 1 and 200),
    ${JSON_OBJECT('entry')},
    primary key (plugin_id, entry_id)
  ) strict, without rowid`,
];
