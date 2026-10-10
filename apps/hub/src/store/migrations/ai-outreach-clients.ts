const COPIED =
  'id, profile_id, chat_id, from_chat_id, how, target, target_label, reason, urgent, state, detail, call_id, client_id, created_at, answered_at, ended_at, expires_at';

export const AI_OUTREACH_CLIENT_TABLES: readonly string[] = [
  `create table ai_outreach_next (
    id text primary key,
    profile_id text not null references profiles (id) on delete cascade,
    chat_id text references ai_chats (id) on delete set null,
    from_chat_id text references ai_chats (id) on delete set null,
    how text not null
      check (how in ('phone', 'desktop', 'app', 'camera', 'channel', 'message')),
    target text not null check (length(target) between 1 and 200),
    target_label text not null check (length(target_label) between 1 and 120),
    reason text not null check (length(reason) between 1 and 500),
    urgent integer not null check (urgent in (0, 1)),
    state text not null
      check (state in ('ringing', 'live', 'ended', 'missed', 'declined', 'failed', 'sent')),
    detail text check (detail is null or length(detail) <= 2000),
    call_id text,
    client_id text references clients (id) on delete set null,
    clients text not null default '[]' check (json_valid(clients)),
    created_at text not null,
    answered_at text,
    ended_at text,
    expires_at text
  ) strict`,
  `insert into ai_outreach_next (${COPIED}) select ${COPIED} from ai_outreach`,
  'drop table ai_outreach',
  'alter table ai_outreach_next rename to ai_outreach',
  'create index ai_outreach_profile on ai_outreach (profile_id, created_at)',
  "create index ai_outreach_open on ai_outreach (state) where state in ('ringing', 'live')",
];
