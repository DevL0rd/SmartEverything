export const TRANSCRIPT_READER_COLUMNS: readonly string[] = [
  'alter table transcript_lines add column ended_at text',
  "alter table transcript_lines add column timing text check (timing is null or timing = 'wall_clock')",
  'create index transcript_lines_time on transcript_lines (at, id)',
  'create index transcript_lines_session_time on transcript_lines (session_id, at, id)',
  'create index transcript_sessions_plugin_time on transcript_sessions (plugin_id, started_at, id)',
  'create table transcript_line_sequence (singleton integer primary key check (singleton = 1), next_id integer not null) strict',
  'insert into transcript_line_sequence select 1, coalesce(max(id), 0) + 1 from transcript_lines',
];
