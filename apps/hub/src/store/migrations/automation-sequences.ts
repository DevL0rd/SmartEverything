export const AUTOMATION_SEQUENCE_TABLES = [
  `create table harness_effect_authorities_next (
    kind text not null check(kind in ('command','schedule','automation','sequence')), id text not null,
    profile_id text not null references profiles(id), authorities text not null,
    primary key(kind,id)
  ) strict`,
  'insert into harness_effect_authorities_next(kind,id,profile_id,authorities) select kind,id,profile_id,authorities from harness_effect_authorities',
  'drop table harness_effect_authorities',
  'alter table harness_effect_authorities_next rename to harness_effect_authorities',

  `create table automation_sequences (
    id text primary key, name text not null, definition text not null, revision text not null,
    created_at text not null, updated_at text not null
  ) strict`,
  'alter table automation_runs add column ordered integer not null default 0',
  "alter table automation_runs add column target_type text not null default 'automation'",
  "alter table automation_runs add column sequence_snapshot text not null default '{}'",
  "alter table automation_runs add column parameter_snapshot text not null default '{}'",
] as const;
