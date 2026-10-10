const CHAT_OF_ROW = `coalesce(
  (select m.chat_id from assistant_messages m where m.id = u.message_id),
  (select coalesce(o.chat_id, o.from_chat_id) from ai_outreach o where o.id = u.call_id)
)`;

export const AI_USAGE_CHAT_LINKS: readonly string[] = [
  `update ai_chats set cost_micros = cost_micros + coalesce((
     select sum(u.cost_micros) from ai_usage u
     where u.chat_id is null and ${CHAT_OF_ROW} = ai_chats.id), 0)`,
  `update ai_usage as u set chat_id = ${CHAT_OF_ROW}
   where u.chat_id is null and ${CHAT_OF_ROW} in (select id from ai_chats)`,
];
