export const AI_PROJECT_TABLES = [
  "alter table ai_chats add column deletion_state text check(deletion_state in ('deleting','failed'))",
  'alter table ai_chats add column deletion_error text',
  `create table ai_projects (
    chat_id text primary key references ai_chats(id) on delete cascade,
    profile_id text not null references profiles(id),
    root_identity text,
    revision text not null,
    updated_at text not null
  ) strict`,
  `create table ai_project_receipts (
    chat_id text not null references ai_chats(id) on delete cascade,
    operation_id text not null,
    request_hash text not null,
    state text not null check(state in ('pending','complete')),
    result_path text not null,
    primary key(chat_id,operation_id)
  ) strict`,
] as const;
