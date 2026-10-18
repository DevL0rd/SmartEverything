export const AUTOMATION_SPEECH_TABLES = [
  `create table speech_commits (id integer primary key autoincrement) strict`,
  `create table automation_speech_grants (
    automation_id text primary key references automations(id) on delete cascade,
    revision text not null, principal text not null, watermark integer not null
  ) strict`,
  `create table automation_speech_occurrences (
    automation_id text not null references automations(id) on delete cascade,
    revision text not null, commit_id integer not null,
    primary key(automation_id,revision,commit_id)
  ) strict`,
] as const;
