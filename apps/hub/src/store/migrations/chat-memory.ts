import type { Migration } from './migration';

export const CHAT_MEMORY_MIGRATION: Migration = {
  version: 161,
  name: 'chat-memory',
  statements: [
    'alter table ai_chats add column memory integer not null default 1 check (memory in (0, 1))',
  ],
};
