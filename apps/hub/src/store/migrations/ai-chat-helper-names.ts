import type { Migration } from './migration';

export const AI_CHAT_HELPER_NAMES_MIGRATION: Migration = {
  version: 173,
  name: 'ai-chat-helper-names',
  statements: [
    `alter table ai_chats add column helper_name text
     check (helper_name is null or (kind = 'subagent' and length(trim(helper_name)) > 0))`,
    `with historical_helpers as (
       select id,
         case when parent_id is null then 'Helper'
           else 'Helper ' || row_number() over (partition by parent_id order by created_at, id)
         end as name
       from ai_chats where kind = 'subagent'
     )
     update ai_chats set helper_name = historical_helpers.name
     from historical_helpers where ai_chats.id = historical_helpers.id`,
    `create unique index ai_chats_helper_name on ai_chats (parent_id, helper_name collate nocase)
     where helper_name is not null`,
  ],
};
