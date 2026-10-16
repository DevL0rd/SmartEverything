export const AUTOMATION_SPEECH_TABLES = [
  `create table speech_sequence (singleton integer primary key check(singleton=1), next_id integer not null) strict`,
  `insert into speech_sequence(singleton,next_id) values(1,1)`,
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
