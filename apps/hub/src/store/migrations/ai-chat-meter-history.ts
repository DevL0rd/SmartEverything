import type { Migration } from './migration';

export const AI_CHAT_METER_HISTORY_MIGRATION: Migration = {
  version: 172,
  name: 'ai-chat-meter-history',
  statements: [
    `create table ai_chat_meter_history (
      chat_id text not null references ai_chats (id) on delete cascade,
      at text not null,
      kind text not null check (kind in ('context', 'cache')),
      percent integer not null check (percent between 0 and 100)
    ) strict`,
    'create index ai_chat_meter_history_by_chat on ai_chat_meter_history (chat_id, kind, at)',
    'create index ai_chat_meter_history_by_age on ai_chat_meter_history (at)',
    'create index ai_usage_by_chat_meter on ai_usage (chat_id, at) where tokens_in > 0',
  ],
};
