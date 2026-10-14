import type { AiChatRow } from '@smarteverything/domain';
import { z } from 'zod';
import type { StoreContext } from '../context';
import { MESSAGE_COLUMNS, STORED_MESSAGE } from './assistant-chat';
import { removeChildAgentRuns } from './ai-child-agent-removal';

export function removeStoredChat(
  context: StoreContext,
  chat: AiChatRow,
  read: (id: string) => AiChatRow,
): void {
  context.write(() => {
    const messages = context.sql.all(
      STORED_MESSAGE,
      `select ${MESSAGE_COLUMNS} from assistant_messages where chat_id=$id`,
      { id: chat.id },
    );
    const children = context.sql
      .all(z.strictObject({ id: z.uuid() }), 'select id from ai_chats where parent_id=$id', {
        id: chat.id,
      })
      .map((row) => read(row.id));
    context.sql.run(
      'detach native child lineage from the deleted conversation',
      `delete from harness_children where parent_session in
       (select session_id from dsh_sessions where chat_id=$id) or child_session in
       (select session_id from dsh_sessions where chat_id=$id)`,
      { id: chat.id },
    );
    context.sql.run(
      'detach native forks from the deleted source conversation',
      `delete from harness_forks where parent_session in
       (select session_id from dsh_sessions where chat_id=$id)`,
      { id: chat.id },
    );
    removeChildAgentRuns(context, chat.id, read);
    context.sql.run('remove the AI chat', 'delete from ai_chats where id=$id', { id: chat.id });
    for (const message of messages) context.changed('assistant_messages', 'DELETE', null, message);
    for (const child of children) context.changed('ai_chats', 'UPDATE', read(child.id), child);
    context.changed('ai_chats', 'DELETE', null, chat);
  });
}
