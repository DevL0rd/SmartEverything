export const HARNESS_COORDINATION_TABLES: readonly string[] = [
  `create table harness_grants (
    session_id text primary key references dsh_sessions(session_id) on delete cascade,
    profile_id text not null references profiles(id), target text not null,
    runtime_instance text not null, generation text not null, authority text not null,
    route text not null, permission text not null, cwd text not null, client_id text, role text not null, revoked integer not null default 0
  ) strict`,
  `create table harness_projections (
    session_id text primary key references dsh_sessions(session_id) on delete cascade,
    projection text not null, event_seq integer not null default -1
  ) strict`,
  `create table harness_operations (
    operation_id text primary key, session_id text not null references dsh_sessions(session_id) on delete cascade,
    request text not null, result text, state text not null check(state in ('pending','completed','unknown'))
  ) strict`,
  `create table harness_deliveries (
    delivery_id text primary key references assistant_events(id) on delete cascade,
    session_id text not null references dsh_sessions(session_id) on delete cascade,
    reply_id text not null references assistant_messages(id), state text not null check(state in ('admitted','completed','unknown')),
    text text not null default ''
  ) strict`,
  `create table harness_children (
    operation_id text primary key, parent_session text not null references dsh_sessions(session_id),
    child_session text not null references dsh_sessions(session_id), run_id text not null,
    delivery_id text not null unique, state text not null, result text, delivered integer not null default 0
  ) strict`,
];
