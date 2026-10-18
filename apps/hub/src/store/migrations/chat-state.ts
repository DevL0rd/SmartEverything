export const CHAT_STATE_COLUMNS: readonly string[] = [
  'alter table ai_chats add column read_at text',
  'alter table ai_chats add column context_percent integer check (context_percent is null or context_percent between 0 and 100)',
  'alter table ai_chats add column branch_message_id text references assistant_messages (id) on delete set null',
  'update ai_chats set read_at = last_message_at',
  `alter table assistant_messages add column reason_code text check (reason_code is null or reason_code in ('credits', 'rate_limit', 'model_unavailable', 'offline', 'interrupted', 'stopped', 'unknown'))`,
  'alter table assistant_messages add column client_message_id text',
  `create unique index assistant_messages_by_client_message
     on assistant_messages (chat_id, client_message_id) where client_message_id is not null`,
  `update assistant_messages set reason_code = 'interrupted'
     where state = 'failed' and reason = 'Stopped by a server restart.'`,
  `update assistant_messages set reason_code = 'stopped' where state = 'failed' and reason = 'Stopped.'`,
  `update assistant_messages set reason_code = 'credits'
     where state = 'failed' and reason like 'OpenRouter is out of credits%'`,
  `update assistant_messages set reason_code = 'rate_limit'
     where state = 'failed' and reason like 'OpenRouter is busy right now%'`,
];
