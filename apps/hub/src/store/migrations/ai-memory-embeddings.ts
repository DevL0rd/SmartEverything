import type { Migration } from './migration';

export const AI_MEMORY_EMBEDDINGS_MIGRATION: Migration = {
  version: 160,
  name: 'ai-memory-embeddings',
  statements: [
    'alter table ai_memories add column embedding blob',
    'alter table ai_memories add column embedding_model text',
  ],
};
