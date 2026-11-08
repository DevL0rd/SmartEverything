import type { Migration } from './migration';

export const ASSISTANT_REACTIONS_MIGRATION: Migration = {
  version: 175,
  name: 'assistant-reactions',
  statements: [
    `create table assistant_reactions (
      message_id text not null references assistant_messages (id) on delete cascade,
      emoji text not null,
      actor_kind text not null check (actor_kind in ('person', 'assistant')),
      actor_id text not null,
      actor_label text not null,
      primary key (message_id, emoji, actor_kind, actor_id)
    ) strict`,
  ],
};
