const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

const RETIRED_CHATS = `(json_extract(c.engine, '$.kind') in ('claude-session', 'codex-thread') or c.kind = 'worker')`;

const OPEN_EVENTS = `select e.id, e.message_id from assistant_events e
  join ai_chats c on c.id = e.chat_id
  where e.answered_at is null and ${RETIRED_CHATS}`;

export const RETIRE_RESPONDERS: readonly string[] = [
  `update assistant_messages set state = 'failed',
     reason = 'Assistant unavailable: Claude Code and Codex no longer answer chats; this chat now uses OpenRouter.'
   where state in ('queued', 'delivered', 'working')
     and id in (select message_id from (${OPEN_EVENTS}) where message_id is not null)`,
  `update assistant_events set answered_at = ${NOW}
   where id in (select id from (${OPEN_EVENTS}))`,
  `update ai_chats set kind = 'chat' where kind = 'worker'`,
  `update ai_chats set engine = json_object(
     'kind', 'openrouter',
     'model', case when json_extract(engine, '$.kind') = 'openrouter' then json_extract(engine, '$.model') end,
     'effort', case when json_extract(engine, '$.kind') = 'openrouter' then json_extract(engine, '$.effort') end)`,
  `update assistant_messages set origin = json_set(origin, '$.source', 'chat')
   where json_extract(origin, '$.source') = 'worker'`,
  `update assistant_settings set settings = json_remove(settings,
     '$.mode', '$.workspace', '$.default_engine', '$.background_only',
     '$.conversation_model', '$.conversation_effort', '$.new_chat_model', '$.new_chat_effort')`,
  `update mcp_tokens set revoked_at = coalesce(revoked_at, ${NOW})
   where name = 'Codex on this computer'`,
  `delete from ai_usage where source in ('claude', 'codex') or work = 'worker'`,
];
