import type { Migration } from './migration';

const OLD = 'select id from automations where definition_v2 is not null';
const OLD_RUNS = `select id from automation_runs where plan_hash is null or automation_id in (${OLD})`;

const OWNED_BY_AUTOMATION = [
  'automation_revisions',
  'automation_decisions',
  'automation_node_state',
  'automation_tests',
  'automation_questions',
  'automation_speech_grants',
  'automation_speech_occurrences',
  'signal_watch_state',
] as const;

const HASH = "length(plan_hash) = 64 and plan_hash not glob '*[^0-9a-f]*'";
const OBJECT = (column: string): string =>
  `json_valid(${column}) and json_type(${column}) = 'object'`;
const ARRAY = (column: string): string =>
  `json_valid(${column}) and json_type(${column}) = 'array'`;

const RUN_COLUMNS =
  'id, automation_id, revision, owner_profile_id, control_key, parent_run_id, status, current_node, error, created_at, started_at, finished_at, plan_hash, plan_refs, mode, state, wake_at, waiting_on, trigger, cause_chain, started_by, steps, commands, iterations, active_paths';

const RUNS_TABLE = `create table automation_runs_next (
    id text primary key,
    automation_id text not null,
    revision integer not null,
    owner_profile_id text,
    control_key text,
    parent_run_id text,
    status text not null,
    current_node text,
    error text,
    created_at text not null,
    started_at text,
    finished_at text,
    plan_hash text not null check (${HASH}),
    plan_refs text not null default '[]' check (${ARRAY('plan_refs')}),
    mode text not null default 'live' check (mode in ('live', 'dry', 'simulated')),
    state text check (state is null or (${OBJECT('state')})),
    wake_at text,
    waiting_on text check (waiting_on is null or (${OBJECT('waiting_on')})),
    trigger text check (trigger is null or (${OBJECT('trigger')})),
    cause_chain text not null default '[]' check (${ARRAY('cause_chain')}),
    started_by text,
    steps integer not null default 0 check (steps >= 0),
    commands integer not null default 0 check (commands >= 0),
    iterations integer not null default 0 check (iterations >= 0),
    active_paths text not null default '[]' check (${ARRAY('active_paths')})
  ) strict`;

const EFFECTS_TABLE = `create table harness_effect_authorities_next (
    kind text not null check (kind in ('command', 'schedule', 'automation')),
    id text not null,
    profile_id text not null references profiles (id),
    authorities text not null,
    primary key (kind, id)
  ) strict`;

export const OLD_AUTOMATIONS_DROP_STATEMENTS: readonly string[] = [
  `delete from automation_run_commands where run_id in (${OLD_RUNS})`,
  `delete from automation_run_nodes where run_id in (${OLD_RUNS})`,
  `delete from automation_questions where run_id in (${OLD_RUNS})`,
  `delete from automation_runs where id in (${OLD_RUNS})`,
  ...OWNED_BY_AUTOMATION.map((table) => `delete from ${table} where automation_id in (${OLD})`),
  `delete from automation_values where owner_automation_id in (${OLD})`,
  `update ai_wakes set automation_id = null where automation_id in (${OLD})`,
  `delete from harness_effect_authorities where kind = 'automation' and id in (${OLD})`,
  "delete from harness_effect_authorities where kind = 'automation' and id not in (select id from automations)",
  'delete from automations where definition_v2 is not null',
  'alter table automations drop column definition_v2',
  'alter table automations drop column definition_v1',
  RUNS_TABLE,
  `insert into automation_runs_next (${RUN_COLUMNS}) select ${RUN_COLUMNS} from automation_runs`,
  'drop table automation_runs',
  'alter table automation_runs_next rename to automation_runs',
  'create index automation_runs_target on automation_runs(automation_id, created_at)',
  'create index automation_runs_status on automation_runs(status, created_at)',
  'create index automation_runs_wake on automation_runs(wake_at) where wake_at is not null',
  'create index automation_runs_plan on automation_runs(plan_hash)',
  EFFECTS_TABLE,
  "insert into harness_effect_authorities_next select kind, id, profile_id, authorities from harness_effect_authorities where kind <> 'sequence'",
  'drop table harness_effect_authorities',
  'alter table harness_effect_authorities_next rename to harness_effect_authorities',
];

export const OLD_AUTOMATIONS_DROP_MIGRATION: Migration = {
  version: 131,
  name: 'drop_old_automations',
  statements: OLD_AUTOMATIONS_DROP_STATEMENTS,
  foreignKeys: 'off',
};
