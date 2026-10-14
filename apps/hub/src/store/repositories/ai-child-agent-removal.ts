import type { AiChatRow } from '@smarteverything/domain';
import { z } from 'zod';
import type { StoreContext } from '../context';

export function removeChildAgentRuns(
  context: StoreContext,
  chatId: string,
  read: (id: string) => AiChatRow,
): void {
  const parents = context.sql
    .all(
      z.strictObject({ id: z.uuid() }),
      `select distinct parent_chat_id as id from ai_agent_runs
     where json_extract(projection,'$.child_chat_id')=$id and parent_chat_id<>$id`,
      { id: chatId },
    )
    .map((row) => read(row.id));
  context.sql.run(
    'remove deleted child chat agent projections',
    `delete from ai_agent_runs where json_extract(projection,'$.child_chat_id')=$id`,
    { id: chatId },
  );
  for (const parent of parents) context.changed('ai_chats', 'UPDATE', read(parent.id), parent);
}
