import { z } from 'zod';
import type { StoreContext } from '../context';

const UNSETTLED = z.strictObject({ unsettled: z.int().min(0).max(1) });

export function chatHasUnsettledWork(context: StoreContext, chatId: string): boolean {
  const row = context.sql.get(
    UNSETTLED,
    `select (
      exists(select 1 from assistant_events where chat_id=$chat and answered_at is null)
      or exists(select 1 from harness_openings where chat_id=$chat and state='pending')
      or exists(select 1 from harness_operations o join dsh_sessions s using(session_id)
        where s.chat_id=$chat and o.state<>'completed')
      or exists(select 1 from harness_deliveries d join dsh_sessions s using(session_id)
        where s.chat_id=$chat and d.state<>'completed')
      or exists(select 1 from harness_children c join dsh_sessions s
        on s.session_id=c.parent_session or s.session_id=c.child_session
        where s.chat_id=$chat and (c.state not in ('completed','failed') or c.delivered=0))
    ) as unsettled`,
    { chat: chatId },
  );
  if (row === undefined) throw new Error('Chat work admission did not return its required state.');
  return row.unsettled === 1;
}
