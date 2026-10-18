import type { AssistantMessageRow } from '@smarteverything/domain';
import type { StoreContext } from '../context';
import { MESSAGE_COLUMNS, STORED_MESSAGE } from './assistant-message-storage';

export function messageWithToolCall(
  context: StoreContext,
  chatId: string,
  callId: string,
): AssistantMessageRow | undefined {
  return context.sql.get(
    STORED_MESSAGE,
    `select ${MESSAGE_COLUMNS} from assistant_messages
     where chat_id = $chat
       and exists (
         select 1 from json_each(embeds) e, json_each(e.value, '$.parts') p
         where json_extract(e.value, '$.kind') = 'chat_timeline'
           and json_extract(p.value, '$.kind') = 'tool'
           and json_extract(p.value, '$.tool.callId') = $call)
     order by created_at desc, rowid desc limit 1`,
    { chat: chatId, call: callId },
  );
}
