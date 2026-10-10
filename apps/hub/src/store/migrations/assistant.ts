import { COLUMN_TYPES } from './core-tables';

const { JSON_ARRAY, JSON_OBJECT, NAMED } = COLUMN_TYPES;

export const ASSISTANT_TABLES: readonly string[] = [
  `create table assistant_settings (
    id integer primary key check (id = 1),
    ${JSON_OBJECT('settings')},
    updated_at text not null
  ) strict`,
  `create table assistant_messages (
    id text primary key,
    profile_id text not null references profiles (id) on delete cascade,
    client_id text,
    role text not null check (role in ('person', 'responder', 'system')),
    kind text not null check (kind in ('text', 'update', 'action', 'call')),
    ${NAMED('author', 120)},
    text text not null check (length(text) <= 16000),
    ${JSON_ARRAY('attachments')},
    state text check (state in ('queued', 'delivered', 'working', 'answered', 'failed')),
    reason text,
    ${JSON_ARRAY('steps')},
    reply_to text references assistant_messages (id) on delete set null,
    created_at text not null,
    updated_at text not null
  ) strict`,
  'create index assistant_messages_by_profile on assistant_messages (profile_id, created_at)',
  `create table assistant_attachments (
    id text primary key,
    message_id text references assistant_messages (id) on delete cascade,
    profile_id text not null references profiles (id) on delete cascade,
    ${NAMED('name', 200)},
    ${NAMED('mime', 120)},
    bytes integer not null check (bytes > 0),
    width integer check (width > 0),
    height integer check (height > 0),
    storage_path text not null,
    sha256 text not null,
    created_at text not null
  ) strict`,
  'create index assistant_attachments_by_message on assistant_attachments (message_id)',
  `create table assistant_events (
    cursor integer primary key autoincrement,
    id text not null unique,
    kind text not null check (kind in ('chat', 'voice')),
    message_id text references assistant_messages (id) on delete set null,
    profile_id text not null references profiles (id) on delete cascade,
    client_id text,
    text text not null,
    received_at text not null,
    delivered_at text,
    answered_at text
  ) strict`,
  `alter table mcp_tokens add column local_only integer not null default 0
    check (local_only in (0, 1))`,
];
