export const PENDING_REQUESTS_SQL = `(coalesce((select json_array_length(p.projection, '$.interactions')
   from harness_projections p where p.session_id = json_extract(ai_chats.engine, '$.session_id')), 0)
 + coalesce((select count(*) from ai_provider_chats pc, json_each(pc.prompts) j
   where pc.chat_id = ai_chats.id and json_extract(j.value, '$.status') = 'pending'), 0))`;
