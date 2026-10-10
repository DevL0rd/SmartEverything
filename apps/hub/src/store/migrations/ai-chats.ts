import { randomUUID } from 'node:crypto';
import type { LogPayload } from '@smarteverything/logging';
import { z } from 'zod';
import type { Sql } from '../sql';
import { COLUMN_TYPES } from './core-tables';

const { BOOLEAN, JSON_ARRAY, NAMED } = COLUMN_TYPES;

export const AI_CHAT_TABLES: readonly string[] = [
  `create table ai_chats (
    id text primary key,
    profile_id text not null references profiles (id) on delete cascade,
    kind text not null check (kind in ('chat', 'subagent', 'worker', 'plugin', 'call')),
    ${NAMED('title', 80)},
    icon text,
    parent_id text references ai_chats (id) on delete set null,
    source_key text,
    engine text not null check (json_valid(engine) and json_type(engine) = 'object'),
    tools text check (tools is null or (json_valid(tools) and json_type(tools) = 'array')),
    ${BOOLEAN('pinned')},
    archived_at text,
    cost_micros integer not null default 0 check (cost_micros >= 0),
    last_message_at text,
    created_at text not null,
    updated_at text not null
  ) strict`,
  'create index ai_chats_by_source on ai_chats (profile_id, source_key)',
  'create index ai_chats_by_profile on ai_chats (profile_id, last_message_at)',
  `alter table assistant_messages add column chat_id text references ai_chats (id) on delete cascade`,
  `alter table assistant_messages add column origin text
    check (origin is null or (json_valid(origin) and json_type(origin) = 'object'))`,
  `alter table assistant_messages add column ${JSON_ARRAY('embeds')}`,
  'alter table assistant_messages add column cost_micros integer not null default 0 check (cost_micros >= 0)',
  'alter table assistant_messages add column model text',
  'create index assistant_messages_by_chat on assistant_messages (chat_id, created_at)',
  `create table assistant_events_next (
    cursor integer primary key autoincrement,
    id text not null unique,
    kind text not null check (kind in ('chat', 'voice', 'plugin', 'wake', 'report')),
    chat_id text references ai_chats (id) on delete cascade,
    message_id text references assistant_messages (id) on delete set null,
    profile_id text not null references profiles (id) on delete cascade,
    client_id text,
    text text not null,
    received_at text not null,
    delivered_at text,
    answered_at text
  ) strict`,
  `insert into assistant_events_next
     (cursor, id, kind, message_id, profile_id, client_id, text, received_at, delivered_at, answered_at)
   select cursor, id, kind, message_id, profile_id, client_id, text, received_at, delivered_at, answered_at
   from assistant_events`,
  'drop table assistant_events',
  'alter table assistant_events_next rename to assistant_events',
  `update assistant_settings set settings = json_remove(
     json_set(settings, '$.mode', 'none'), '$.share_coordinator')
   where json_extract(settings, '$.mode') in ('manual-mcp', 'claude-session', 'codex-local')`,
  `update assistant_settings set settings = json_remove(settings, '$.share_coordinator')`,
];

const PROFILE_ID = z.strictObject({ id: z.uuid() });

const OPENROUTER_ENGINE = JSON.stringify({
  kind: 'openrouter',
  model: null,
  effort: null,
  worker_id: null,
});
function addEarlierChat(sql: Sql, profileId: string, engine: string, now: string): string {
  const id = randomUUID();
  sql.run(
    'add the profile’s earlier chat',
    `insert into ai_chats (id, profile_id, kind, title, icon, parent_id, source_key, engine, tools,
       pinned, archived_at, cost_micros, last_message_at, created_at, updated_at)
     values ($id, $profile, 'chat', 'Earlier chat', null, null, null, $engine, null, 0, null, 0,
       (select max(created_at) from assistant_messages where profile_id = $profile), $now, $now)`,
    { id, profile: profileId, engine, now },
  );
  sql.run(
    'move the profile’s messages into its earlier chat',
    'update assistant_messages set chat_id = $id where profile_id = $profile',
    { id, profile: profileId },
  );
  sql.run(
    'move the profile’s requests into its earlier chat',
    'update assistant_events set chat_id = $id where profile_id = $profile',
    { id, profile: profileId },
  );
  return id;
}

export function createEarlierChats(sql: Sql): LogPayload {
  const now = new Date().toISOString();
  const profiles = sql.all(
    PROFILE_ID,
    'select distinct profile_id as id from assistant_messages union select distinct profile_id as id from assistant_events',
  );
  const chats = profiles.map((profile) => addEarlierChat(sql, profile.id, OPENROUTER_ENGINE, now));
  return { chats: chats.length };
}
