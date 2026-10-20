const OBJECT = (column: string): string =>
  `json_valid(${column}) and json_type(${column}) = 'object'`;
const ARRAY = (column: string): string =>
  `json_valid(${column}) and json_type(${column}) = 'array'`;
const HASH = (column: string): string =>
  `length(${column}) = 64 and ${column} not glob '*[^0-9a-f]*'`;

const EMPTY_LAYOUT_TEXT = '{"nodes":{},"frames":[],"comments":[]}';

export const AUTOMATIONS_V3_STATEMENTS: readonly string[] = [
  `alter table automations add column draft text check (draft is null or (${OBJECT('draft')}))`,
  `alter table automations add column layout text not null default '${EMPTY_LAYOUT_TEXT}' check (${OBJECT('layout')})`,
  `alter table automations add column definition_v2 text check (definition_v2 is null or (${OBJECT('definition_v2')}))`,
  `create table automation_revisions (
    automation_id text not null references automations (id) on delete cascade,
    revision integer not null check (revision >= 1),
    definition text not null check (${OBJECT('definition')}),
    layout text not null default '${EMPTY_LAYOUT_TEXT}' check (${OBJECT('layout')}),
    plan_hash text not null check (${HASH('plan_hash')}),
    saved_at text not null,
    author text check (author is null or (${OBJECT('author')})),
    primary key (automation_id, revision)
  ) strict, without rowid`,
  `create table automation_functions (
    id text primary key,
    name text not null unique check (length(name) between 1 and 80),
    description text,
    category text,
    icon text,
    latest_revision integer not null check (latest_revision >= 1),
    created_by text,
    author text check (author is null or (${OBJECT('author')})),
    created_at text not null,
    updated_at text not null,
    draft text check (draft is null or (${OBJECT('draft')}))
  ) strict`,
  `create table automation_function_revisions (
    function_id text not null references automation_functions (id) on delete cascade,
    revision integer not null check (revision >= 1),
    definition text not null check (${OBJECT('definition')}),
    layout text not null default '${EMPTY_LAYOUT_TEXT}' check (${OBJECT('layout')}),
    interface_hash text not null check (${HASH('interface_hash')}),
    compat text not null check (compat in ('compatible', 'breaking')),
    plan_hash text not null check (${HASH('plan_hash')}),
    saved_at text not null,
    author text check (author is null or (${OBJECT('author')})),
    primary key (function_id, revision)
  ) strict, without rowid`,
  `create table automation_plans (
    hash text primary key check (${HASH('hash')}),
    kind text not null check (kind in ('automation', 'function')),
    json text not null check (json_valid(json)),
    created_at text not null
  ) strict, without rowid`,
  `create table automation_runs_next (
    id text primary key,
    automation_id text not null,
    revision integer not null,
    owner_profile_id text,
    control_key text,
    parent_run_id text,
    status text not null,
    current_node text,
    legacy_trace text check (legacy_trace is null or (${ARRAY('legacy_trace')})),
    error text,
    created_at text not null,
    started_at text,
    finished_at text,
    plan_hash text check (plan_hash is null or (${HASH('plan_hash')})),
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
  ) strict`,
  `insert into automation_runs_next (
    id, automation_id, revision, owner_profile_id, control_key, parent_run_id, status,
    current_node, legacy_trace, error, created_at, started_at, finished_at
  ) select
    id, automation_id, revision, owner_profile_id, control_key, parent_run_id, status,
    current_node, trace, error, created_at, started_at, finished_at
  from automation_runs`,
  'drop table automation_runs',
  'alter table automation_runs_next rename to automation_runs',
  'create index automation_runs_target on automation_runs(automation_id, created_at)',
  'create index automation_runs_status on automation_runs(status, created_at)',
  'create index automation_runs_wake on automation_runs(wake_at) where wake_at is not null',
  'create index automation_runs_plan on automation_runs(plan_hash) where plan_hash is not null',
  `create table automation_run_nodes (
    run_id text not null references automation_runs (id) on delete cascade,
    seq integer not null check (seq >= 0),
    path text not null check (length(path) >= 1),
    node_id text not null,
    iteration integer not null default 0 check (iteration >= 0),
    status text not null check (status in ('running', 'waiting', 'succeeded', 'failed', 'cancelled', 'skipped')),
    started_at text,
    finished_at text,
    duration_ms integer check (duration_ms is null or duration_ms >= 0),
    input_preview text check (input_preview is null or (${OBJECT('input_preview')})),
    output_preview text check (output_preview is null or (${OBJECT('output_preview')})),
    truncated integer not null default 0 check (truncated in (0, 1)),
    error text check (error is null or (${OBJECT('error')})),
    command_ids text not null default '[]' check (${ARRAY('command_ids')}),
    late integer not null default 0 check (late in (0, 1)),
    primary key (run_id, seq)
  ) strict, without rowid`,
  'create index automation_run_nodes_node on automation_run_nodes(run_id, node_id)',
  `create table automation_decisions (
    automation_id text not null references automations (id) on delete cascade,
    window_start text not null,
    reason text not null check (reason in ('admit_false', 'single_busy', 'queue_full', 'parallel_full', 'stale', 'storm', 'feedback')),
    count integer not null check (count >= 1),
    first_at text not null,
    last_at text not null,
    detail text check (detail is null or (${OBJECT('detail')})),
    primary key (automation_id, window_start, reason)
  ) strict, without rowid`,
  'create index automation_decisions_window on automation_decisions(window_start)',
  `create table automation_node_state (
    automation_id text not null references automations (id) on delete cascade,
    node_id text not null,
    partition text not null default '',
    state text not null check (json_valid(state)),
    wake_at text,
    updated_at text not null,
    primary key (automation_id, node_id, partition)
  ) strict, without rowid`,
  'create index automation_node_state_wake on automation_node_state(wake_at) where wake_at is not null',
  'alter table automation_values add column owner_automation_id text references automations (id) on delete cascade',
  'create index automation_values_owner on automation_values(owner_automation_id) where owner_automation_id is not null',
  `create table automation_tests (
    automation_id text not null references automations (id) on delete cascade,
    id text not null,
    name text not null check (length(name) between 1 and 120),
    scenario text not null check (${OBJECT('scenario')}),
    expectations text not null default '[]' check (${ARRAY('expectations')}),
    updated_at text not null,
    primary key (automation_id, id)
  ) strict, without rowid`,
  `create table automation_questions (
    id text primary key,
    automation_id text not null references automations (id) on delete cascade,
    run_id text not null,
    person_id text not null references profiles (id) on delete cascade,
    question text not null check (length(question) >= 1),
    options text not null check (${ARRAY('options')} and json_array_length(options) between 2 and 4),
    state text not null check (state in ('open', 'answered', 'closed')),
    answer text,
    answered_by text references profiles (id) on delete set null,
    deadline_at text,
    created_at text not null,
    answered_at text
  ) strict, without rowid`,
  "create index automation_questions_person on automation_questions(person_id) where state = 'open'",
  'create index automation_questions_run on automation_questions(run_id)',
  `create table hub_marks (
    name text primary key check (length(name) between 1 and 40),
    at text not null
  ) strict, without rowid`,
];
