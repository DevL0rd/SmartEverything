export const AUTOMATION_RUNTIME_TABLES = [
  `create table automation_values (
    id text primary key, content text not null, revision integer not null,
    created_at text not null, updated_at text not null
  ) strict`,
  `create table automation_runs (
    id text primary key, automation_id text not null, definition_revision text not null,
    definition text not null, reference_snapshot text not null, owner_profile_id text, authority_ids text not null,
    control_key text, parent_run_id text, status text not null, current_node text,
    trace text not null, error text, created_at text not null, started_at text, finished_at text
  ) strict`,
  `create table automation_run_commands (run_id text not null, command_id text primary key) strict`,
  'create index automation_run_commands_run on automation_run_commands(run_id)',
  'create index automation_runs_target on automation_runs(automation_id, created_at)',
  'create index automation_runs_status on automation_runs(status, created_at)',
] as const;
