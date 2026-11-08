import type { Migration } from './migration';

export const AI_MEMORY_STRENGTH_MIGRATION: Migration = {
  version: 162,
  name: 'ai-memory-strength',
  statements: [
    `alter table ai_memories add column kind text not null default 'fact'
       check (kind in ('fact', 'preference', 'episode', 'vocabulary'))`,
    'alter table ai_memories add column importance integer not null default 50 check (importance between 0 and 100)',
    'alter table ai_memories add column happened_on text',
    'alter table ai_memories add column valid_until text',
    'alter table ai_memories add column recalled_at text',
    'alter table ai_memories add column recall_count integer not null default 0 check (recall_count >= 0)',
    `create table ai_memory_learning (
      chat_id text primary key references ai_chats (id) on delete cascade,
      through_at text not null
    ) strict`,
  ],
};
