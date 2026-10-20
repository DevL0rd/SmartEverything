import { z } from 'zod';
import { CLAUDE_SESSION_ID } from '@smarteverything/domain';
import { storedRow } from '../codec';
import type { StoreContext } from '../context';

const CONTINUING_CHAT = storedRow(
  z.strictObject({ id: z.uuid(), session_id: CLAUDE_SESSION_ID }),
  {},
);

export type ContinuingChat = z.output<typeof CONTINUING_CHAT>;

export function continuingChats(
  context: StoreContext,
  deviceId: string,
): readonly ContinuingChat[] {
  return context.sql.all(
    CONTINUING_CHAT,
    `select id, json_extract(engine, '$.continued_from') as session_id from ai_chats
     where json_extract(engine, '$.kind') = 'claude'
       and json_extract(engine, '$.device_id') = $device
       and json_extract(engine, '$.continued_from') is not null
       and deletion_state is null
     order by archived_at is not null, created_at desc`,
    { device: deviceId },
  );
}
