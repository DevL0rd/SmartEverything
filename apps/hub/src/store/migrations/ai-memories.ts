import type { Migration } from './migration';

export const AI_MEMORIES_MIGRATION: Migration = {
  version: 150,
  name: 'ai-memories',
  statements: [
    `create table ai_memories (
      id text primary key,
      scope text not null check (scope in ('person', 'home')),
      profile_id text references profiles (id) on delete cascade,
      text text not null check (length(trim(text)) > 0),
      source_chat_id text references ai_chats (id) on delete set null,
      source_message_id text,
      created_at text not null,
      updated_at text not null,
      check ((scope = 'person') = (profile_id is not null))
    ) strict`,
    'create index ai_memories_by_person on ai_memories (profile_id, updated_at desc, id) where profile_id is not null',
    'create index ai_memories_home on ai_memories (updated_at desc, id) where profile_id is null',
    `create table ai_memory_settings (
      profile_id text primary key references profiles (id) on delete cascade,
      enabled integer not null check (enabled in (0, 1)),
      prompt_chars integer check (prompt_chars is null or prompt_chars > 0)
    ) strict`,
  ],
};
