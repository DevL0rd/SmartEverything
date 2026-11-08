import type { Migration } from './migration';

const LATEST = `with ranked as (
  select id, row_number() over (
    partition by profile_id order by coalesce(last_message_at, created_at) desc
  ) as place
  from ai_chats
  where source_key = 'conversation' and archived_at is null
    and native_admission is not 'retired' and json_extract(engine, '$.kind') = 'dsh'
)
select id from ranked where place = 1`;

const AI_NAME = `coalesce(
  (select json_extract(s.settings, '$.name') from assistant_settings s where s.id = 1),
  'Coordinator')`;

export const ONE_CONVERSATION_CHAT_MIGRATION: Migration = {
  version: 190,
  name: 'one-conversation-chat',
  statements: [
    `update assistant_settings set settings = json_remove(settings, '$.reuse_chat_minutes')
     where json_type(settings, '$.reuse_chat_minutes') is not null`,
    `update ai_chats set source_key = null
     where source_key = 'conversation' and id not in (${LATEST})`,
    `update ai_chats set title = ${AI_NAME}, title_auto = 0
     where source_key = 'conversation'`,
  ],
};
