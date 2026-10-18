import { z } from 'zod';
import { storedRow } from '../codec';
import { found, type StoreContext } from '../context';
import { AiChatsRepository } from './ai-chats';
import { PENDING_REQUESTS_SQL } from './ai-chat-requests';

const PENDING_COUNT = storedRow(z.strictObject({ count: z.int().min(0) }), {});

function pendingRequests(context: StoreContext, id: string): number {
  return found(
    context.sql.get(
      PENDING_COUNT,
      `select ${PENDING_REQUESTS_SQL} as count from ai_chats where id = $id`,
      { id },
    ),
    'AI chat',
    id,
  ).count;
}

export function trackPending<T>(context: StoreContext, id: string | undefined, write: () => T): T {
  if (id === undefined) return write();
  const before = pendingRequests(context, id);
  const result = write();
  if (pendingRequests(context, id) !== before) {
    const after = new AiChatsRepository(context).chat(id);
    context.changed('ai_chats', 'UPDATE', after, { ...after, pending_requests: before });
  }
  return result;
}
