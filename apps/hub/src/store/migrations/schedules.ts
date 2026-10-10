import { COLUMN_TYPES } from './core-tables';

const { JSON_ARRAY, JSON_OBJECT } = COLUMN_TYPES;

export const SCHEDULE_TABLES: readonly string[] = [
  `create table scheduled_actions (
    id text primary key,
    profile_id text not null references profiles (id) on delete cascade,
    client_id text references clients (id) on delete set null,
    via text not null check (via in ('app', 'assistant')),
    label text check (label is null or length(label) between 1 and 80),
    ${JSON_OBJECT('timing')},
    ${JSON_ARRAY('occurrences')},
    ${JSON_ARRAY('steps')},
    ${JSON_ARRAY('step_lines')},
    ${JSON_ARRAY('device_ids')},
    state text not null check (state in ('scheduled', 'running', 'waiting', 'done', 'failed', 'cancelled')),
    next_at text,
    occurrence integer not null default 0 check (occurrence >= 0),
    step integer not null default 0 check (step >= 0),
    ${JSON_ARRAY('results')},
    confirmed_at text,
    confirmed_by text,
    created_at text not null,
    updated_at text not null,
    finished_at text
  ) strict`,
  `create index scheduled_actions_due on scheduled_actions (next_at) where next_at is not null`,
  'create index scheduled_actions_finished on scheduled_actions (finished_at)',
];
