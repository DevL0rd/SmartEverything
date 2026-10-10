export const AI_WAKE_TABLES: readonly string[] = [
  `create table ai_wakes (
    id text primary key,
    profile_id text not null references profiles (id) on delete cascade,
    chat_id text references ai_chats (id) on delete set null,
    automation_id text references automations (id) on delete set null,
    automation_name text not null check (length(automation_name) between 1 and 120),
    headline text not null check (length(headline) between 1 and 300),
    instruction text not null,
    state text not null check (state in ('woke', 'refused', 'failed')),
    reason text,
    created_at text not null
  ) strict`,
  'create index ai_wakes_profile on ai_wakes (profile_id, created_at)',
  'create index ai_wakes_created on ai_wakes (created_at)',
];
