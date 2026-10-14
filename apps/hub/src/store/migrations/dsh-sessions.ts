export const DSH_SESSION_TABLES: readonly string[] = [
  `create table dsh_sessions (
    session_id text primary key, chat_id text not null references ai_chats(id) on delete cascade,
    profile_id text not null references profiles(id) on delete cascade,
    header text not null, composition text not null, inherited_event_count integer not null check(inherited_event_count >= 0),
    next_seq integer not null default 0 check(next_seq >= 0), epoch integer not null default 0 check(epoch >= 0),
    claim text, claim_state text check(claim_state in ('active','released')), acquire_operation text,
    creation_request text not null, created_at text not null
  ) strict`,
  `create index dsh_sessions_chat on dsh_sessions(chat_id,created_at,session_id)`,
  `create index dsh_sessions_profile on dsh_sessions(profile_id,created_at,session_id)`,
  `create table dsh_session_events (
    session_id text not null references dsh_sessions(session_id) on delete cascade,
    seq integer not null check(seq >= 0), event text not null, primary key(session_id,seq)
  ) strict`,
  `create table dsh_session_receipts (
    session_id text not null references dsh_sessions(session_id) on delete cascade,
    operation_id text not null, request text not null, result text not null,
    primary key(session_id,operation_id)
  ) strict`,
  `create table dsh_session_claim_receipts (
    session_id text not null references dsh_sessions(session_id) on delete cascade,
    operation_id text not null, request text not null, claim text not null,
    primary key(session_id,operation_id)
  ) strict`,
  `create table dsh_session_workspaces (
    session_id text not null references dsh_sessions(session_id) on delete cascade,
    target_key text not null, target text not null, cwd text not null, updated_at text not null,
    primary key(session_id,target_key)
  ) strict`,
];
