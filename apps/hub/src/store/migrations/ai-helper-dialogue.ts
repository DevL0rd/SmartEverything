import type { Migration } from './migration';

export const AI_HELPER_DIALOGUE_MIGRATION: Migration = {
  version: 174,
  name: 'ai-helper-dialogue',
  statements: [
    'alter table assistant_events add column helper_parent_message_id text',
    'alter table assistant_events add column helper_quote_text text',
    `create table assistant_helper_receipts (
      chat_id text not null references ai_chats(id) on delete cascade,
      profile_id text not null references profiles(id) on delete cascade,
      client_message_id text not null,
      parent_message_id text not null,
      payload_hash text not null,
      primary key(chat_id, profile_id, client_message_id)
    ) strict`,
    `create index assistant_helper_events on assistant_events (helper_parent_message_id)
     where helper_parent_message_id is not null`,
  ],
};
