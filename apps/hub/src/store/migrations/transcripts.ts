export const TRANSCRIPT_TABLES: readonly string[] = [
  `create table transcript_sessions (
    id text primary key,
    source text not null check (source in ('camera', 'plugin')),
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
  'create index transcript_sessions_started on transcript_sessions (started_at desc)',
  'create index transcript_sessions_source on transcript_sessions (source, source_id, started_at desc)',
  `create table transcript_lines (
    id integer primary key,
    session_id text not null references transcript_sessions (id) on delete cascade,
    at text not null,
    speaker_id text,
    speaker text not null check (length(speaker) between 1 and 120),
    text text not null check (length(text) between 1 and 4000),
    bot integer not null default 0 check (bot in (0, 1))
  ) strict`,
  'create index transcript_lines_session on transcript_lines (session_id, id)',
  `create virtual table transcript_lines_search using fts5(
    text, content = 'transcript_lines', content_rowid = 'id', tokenize = 'unicode61 remove_diacritics 2'
  )`,
  `create trigger transcript_lines_added after insert on transcript_lines begin
    insert into transcript_lines_search (rowid, text) values (new.id, new.text);
  end`,
  `create trigger transcript_lines_removed after delete on transcript_lines begin
    insert into transcript_lines_search (transcript_lines_search, rowid, text)
    values ('delete', old.id, old.text);
  end`,
  `alter table cameras add column transcribe integer not null default 0
    check (transcribe in (0, 1))`,
];
