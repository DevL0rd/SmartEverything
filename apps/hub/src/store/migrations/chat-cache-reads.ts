import type { Migration } from './migration';

export const CHAT_CACHE_READS_MIGRATION: Migration = {
  version: 163,
  name: 'chat-cache-reads',
  statements: [
    'alter table ai_chats add column last_input_tokens integer check (last_input_tokens is null or last_input_tokens >= 0)',
    'alter table ai_chats add column last_cached_tokens integer check (last_cached_tokens is null or last_cached_tokens >= 0)',
  ],
};
