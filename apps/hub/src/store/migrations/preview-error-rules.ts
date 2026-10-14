export const PREVIEW_ERROR_RULE_TABLES = [
  `create table preview_error_rules (
    chat_id text not null references ai_chats(id) on delete cascade,
    scope_key text not null,
    fingerprint text not null,
    reason text not null,
    created_at text not null,
    primary key(chat_id,scope_key,fingerprint)
  ) strict`,
] as const;
