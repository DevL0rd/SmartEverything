export const AI_COORDINATION_COLUMNS: readonly string[] = [
  'alter table assistant_events add column report_to text references ai_chats (id) on delete set null',
  'alter table assistant_events add column hops integer not null default 0 check (hops >= 0)',
  'create index assistant_events_by_chat on assistant_events (chat_id, received_at)',
];
