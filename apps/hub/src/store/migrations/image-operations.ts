export const IMAGE_OPERATION_TABLES: readonly string[] = [
  `create table image_operations (
    sequence integer primary key autoincrement, id text not null unique,
    profile_id text not null references profiles(id) on delete cascade,
    chat_id text not null references ai_chats(id) on delete cascade,
    actor_key text not null, request text not null, receipt text not null,
    state text not null check(state in ('reserved','running','completed','failed','cancelled','unknown')),
    created_at text not null, updated_at text not null
  ) strict`,
  `create index image_operations_chat on image_operations(chat_id,sequence)`,
  `create table image_artifacts (
    attachment_id text primary key references assistant_attachments(id) on delete cascade,
    operation_id text not null references image_operations(id) on delete cascade,
    position integer not null check(position >= 0), lineage text not null,
    unique(operation_id,position)
  ) strict`,
];
