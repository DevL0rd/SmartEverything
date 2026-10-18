export const TRANSCRIPT_LINES_AUTOINCREMENT_TABLES: readonly string[] = [
  `create table transcript_lines_rebuilt (
    id integer primary key autoincrement,
    session_id text not null references transcript_sessions (id) on delete cascade,
    at text not null,
    speaker_id text,
    speaker text not null check (length(speaker) between 1 and 120),
    text text not null check (length(text) between 1 and 4000),
    bot integer not null default 0 check (bot in (0, 1)),
    ended_at text,
    timing text check (timing is null or timing = 'wall_clock')
  ) strict`,
  `insert into transcript_lines_rebuilt (id, session_id, at, speaker_id, speaker, text, bot, ended_at, timing)
    select id, session_id, at, speaker_id, speaker, text, bot, ended_at, timing from transcript_lines`,
  'drop table transcript_lines',
  'alter table transcript_lines_rebuilt rename to transcript_lines',
  'create index transcript_lines_session on transcript_lines (session_id, id)',
  'create index transcript_lines_time on transcript_lines (at, id)',
  'create index transcript_lines_session_time on transcript_lines (session_id, at, id)',
  `create trigger transcript_lines_added after insert on transcript_lines begin
    insert into transcript_lines_search (rowid, text) values (new.id, new.text);
  end`,
  `create trigger transcript_lines_removed after delete on transcript_lines begin
    insert into transcript_lines_search (transcript_lines_search, rowid, text)
    values ('delete', old.id, old.text);
  end`,
  "delete from sqlite_sequence where name = 'transcript_lines'",
  "insert into sqlite_sequence (name, seq) select 'transcript_lines', next_id - 1 from transcript_line_sequence",
  'drop table transcript_line_sequence',
];
