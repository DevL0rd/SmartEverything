export const HARNESS_RECOVERY_TABLES: readonly string[] = [
  `create table harness_outbox (session_id text not null references dsh_sessions(session_id) on delete cascade,epoch integer not null,seq integer not null,payload text not null,source text not null,primary key(session_id,epoch,seq)) strict`,
  `create table harness_consumers (session_id text not null,epoch integer not null,seq integer not null,consumer text not null,primary key(session_id,epoch,seq,consumer),foreign key(session_id,epoch,seq) references harness_outbox(session_id,epoch,seq) on delete cascade) strict`,
  `create table harness_authorities (event_id text primary key references assistant_events(id) on delete cascade,authority text not null) strict`,
  `create table harness_admissions (chat_id text primary key references ai_chats(id) on delete cascade,signature text not null,request text not null) strict`,
  `create table harness_openings (chat_id text primary key references ai_chats(id) on delete cascade,signature text not null,request text not null,state text not null check(state in ('pending','ready','failed')),failure text) strict`,
  `create table harness_forks (chat_id text primary key references ai_chats(id) on delete cascade,parent_session text not null references dsh_sessions(session_id),boundary integer not null) strict`,
  `alter table harness_grants add column event_id text references assistant_events(id)`,
  `alter table harness_deliveries add column start_seq integer`,
  `alter table harness_deliveries add column end_seq integer`,
];
