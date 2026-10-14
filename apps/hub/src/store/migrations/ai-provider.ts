export const AI_PROVIDER_TABLES: readonly string[] = [
  `create table ai_provider_chats (
    chat_id text primary key references ai_chats(id) on delete cascade,
    device_id text not null references devices(id), session_id text, job_id text,
    state text not null, reason text, metadata text, prompts text not null default '[]', updated_at text not null
  ) strict`,
  `create table ai_provider_events (
    job_id text not null, seq integer not null, chat_id text not null references ai_chats(id) on delete cascade,
    event text not null, created_at text not null, primary key(job_id, seq)
  ) strict`,
  `create index ai_provider_events_chat on ai_provider_events(chat_id, created_at)`,
  `create table ai_provider_sessions (
    chat_id text not null references ai_chats(id) on delete cascade,
    device_id text not null references devices(id), session_id text not null,
    primary key(chat_id, device_id, session_id)
  ) strict`,
  `create table ai_provider_turns (
    message_id text primary key references assistant_messages(id) on delete cascade,
    chat_id text not null references ai_chats(id) on delete cascade,
    job_id text not null, created_at text not null
  ) strict`,
  `create table ai_engine_preferences (
    model text primary key, device_id text not null references devices(id), updated_at text not null
  ) strict`,
];
