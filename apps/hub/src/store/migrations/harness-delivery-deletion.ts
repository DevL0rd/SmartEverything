export const HARNESS_DELIVERY_DELETION_TABLES: readonly string[] = [
  `create table harness_deliveries_next (
    delivery_id text primary key references assistant_events(id) on delete cascade,
    session_id text not null references dsh_sessions(session_id) on delete cascade,
    reply_id text references assistant_messages(id) on delete set null,
    state text not null check(state in ('admitted','completed','unknown')),
    text text not null default '', start_seq integer, end_seq integer
  ) strict`,
  `insert into harness_deliveries_next
   (delivery_id,session_id,reply_id,state,text,start_seq,end_seq)
   select delivery_id,session_id,reply_id,state,text,start_seq,end_seq from harness_deliveries`,
  'drop table harness_deliveries',
  'alter table harness_deliveries_next rename to harness_deliveries',
];
