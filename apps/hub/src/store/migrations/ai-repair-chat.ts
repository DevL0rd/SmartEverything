import type { Migration } from './migration';

const ISOLATED = `select event_id from harness_authorities
  where json_extract(authority, '$.repair_root') is not null`;

export const AI_REPAIR_CHAT_MIGRATION: Migration = {
  version: 196,
  name: 'ai-repair-chat',
  statements: [
    `create table harness_turn_authorities (
      session_id text not null references dsh_sessions(session_id) on delete cascade,
      native_turn integer not null check(native_turn >= 0),
      event_id text not null references assistant_events(id) on delete cascade,
      primary key(session_id, native_turn, event_id)
    ) strict`,
    `create table ai_repair_source_approvals (
      event_id text primary key references assistant_events(id) on delete cascade,
      approval text not null
    ) strict`,
    `insert into ai_repair_source_approvals(event_id, approval)
     select e.id, json_object('revision', json_extract(e.text, '$.patch.revision'),
       'paths', json((select json_group_array(json_extract(value, '$.path'))
         from json_each(e.text, '$.patch.sources'))))
     from assistant_events e where e.id in (${ISOLATED})
       and json_valid(e.text) and json_type(e.text, '$.patch') = 'object'`,
    `update assistant_messages set role='responder', kind='text'
     where role='system' and kind='update' and author='AI repair'`,
    `update ai_repair_groups set failed_event_id=json_extract(admission, '$.eventId')
     where json_extract(admission, '$.eventId') in (
       select id from assistant_events where answered_at is null and id in (${ISOLATED}))`,
    `insert into assistant_messages(id, profile_id, chat_id, role, kind, author, text,
       attachments, embeds, state, reason, reason_code, created_at, updated_at)
     select e.id, e.profile_id, e.chat_id, 'responder', 'text', 'AI repair',
       'The previous AI repair investigation was interrupted by the update. Ask the AI to investigate again.',
       '[]', '[]', 'failed', 'The isolated diagnosis was retired.', 'interrupted',
       e.received_at, e.received_at
     from assistant_events e where e.answered_at is null and e.id in (${ISOLATED})
       and not exists(select 1 from assistant_messages m where m.id=e.id)`,
    `update assistant_events set answered_at=coalesce(delivered_at, received_at)
     where answered_at is null and id in (${ISOLATED})`,
    `update harness_authorities set authority=json_remove(
       json_set(authority, '$.repair_origin', json_extract(authority, '$.repair_root')),
       '$.repair_root') where event_id in (${ISOLATED})`,
  ],
};
