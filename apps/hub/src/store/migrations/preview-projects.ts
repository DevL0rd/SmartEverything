export const PREVIEW_PROJECT_TABLES = [
  `create table ai_preview_projects (
    id text primary key,
    chat_id text not null references ai_chats(id) on delete cascade,
    profile_id text not null references profiles(id),
    title text not null,
    revision text not null,
    root text not null,
    entry text not null,
    standalone integer not null check(standalone in (0,1)),
    checksum text
  ) strict`,
] as const;
