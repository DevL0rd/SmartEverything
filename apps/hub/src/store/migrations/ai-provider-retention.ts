import { z } from 'zod';
import type { LogPayload } from '@smarteverything/logging';
import type { Sql } from '../sql';
import { retainProviderEvents } from '../retention';

export const AI_PROVIDER_RETENTION: readonly string[] = [
  'alter table ai_provider_chats add column event_seq integer not null default 0',
  `update ai_provider_chats set event_seq = coalesce(
    (select max(seq) from ai_provider_events where job_id = ai_provider_chats.job_id), 0)`,
];

export function retainExistingProviderEvents(sql: Sql): LogPayload {
  const chats = sql.all(
    z.strictObject({ chat_id: z.string() }),
    'select chat_id from ai_provider_chats',
  );
  for (const chat of chats) retainProviderEvents(sql, chat.chat_id);
  return { chats: chats.length };
}
