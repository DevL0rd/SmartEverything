const COLUMNS =
  'id, source, source_id, plugin_id, title, retention_days, started_at, ended_at, last_line_at, line_count, participants';

export const TRANSCRIPT_SOURCES_STATEMENTS: readonly string[] = [
  `create table transcript_sessions_rebuilt (
    id text primary key,
    source text not null check (source in ('camera', 'plugin', 'phone', 'computer')),
    source_id text not null check (length(source_id) between 1 and 200),
    plugin_id text references plugins (id) on delete cascade,
    title text not null check (length(title) between 1 and 200),
    retention_days integer check (retention_days is null or retention_days between 1 and 3650),
    started_at text not null,
    ended_at text,
    last_line_at text,
    line_count integer not null default 0 check (line_count >= 0),
    participants text not null default '[]'
  ) strict`,
  `insert into transcript_sessions_rebuilt (${COLUMNS}) select ${COLUMNS} from transcript_sessions`,
  'drop table transcript_sessions',
  'alter table transcript_sessions_rebuilt rename to transcript_sessions',
  'create index transcript_sessions_started on transcript_sessions (started_at desc)',
  'create index transcript_sessions_source on transcript_sessions (source, source_id, started_at desc)',
  'create index transcript_sessions_plugin_time on transcript_sessions (plugin_id, started_at, id)',
];
