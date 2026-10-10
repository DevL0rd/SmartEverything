export const AI_OUTREACH_TABLES: readonly string[] = [
  `create table ai_outreach (
    id text primary key,
    profile_id text not null references profiles (id) on delete cascade,
    chat_id text references ai_chats (id) on delete set null,
    from_chat_id text references ai_chats (id) on delete set null,
    how text not null check (how in ('phone', 'desktop', 'camera', 'channel', 'message')),
    target text not null check (length(target) between 1 and 200),
    target_label text not null check (length(target_label) between 1 and 120),
    reason text not null check (length(reason) between 1 and 500),
    urgent integer not null check (urgent in (0, 1)),
    state text not null
      check (state in ('ringing', 'live', 'ended', 'missed', 'declined', 'failed', 'sent')),
    detail text check (detail is null or length(detail) <= 2000),
    call_id text,
    client_id text references clients (id) on delete set null,
    created_at text not null,
    answered_at text,
    ended_at text,
    expires_at text
  ) strict`,
  'create index ai_outreach_profile on ai_outreach (profile_id, created_at)',
  "create index ai_outreach_open on ai_outreach (state) where state in ('ringing', 'live')",
];
