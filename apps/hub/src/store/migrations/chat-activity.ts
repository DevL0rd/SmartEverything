import { CHAT_ACTIVITY_SQL } from '@smarteverything/domain';

export const CHAT_ACTIVITY_REPAIR: readonly string[] = [
  `update ai_chats set last_message_at = (
     select max(created_at) from assistant_messages
     where assistant_messages.chat_id = ai_chats.id and ${CHAT_ACTIVITY_SQL}
   )`,
];
