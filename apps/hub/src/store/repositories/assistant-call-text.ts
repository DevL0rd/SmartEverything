import { z } from 'zod';
import { storedRow } from '../codec';
import type { StoreContext } from '../context';

const CALL_TEXT = storedRow(
  z.strictObject({ at: z.iso.datetime({ offset: true }), text: z.string() }),
  {},
);

export type CallText = z.output<typeof CALL_TEXT>;

export interface CallTextQuery {
  readonly profileId: string;
  readonly sourceKey: string;
  readonly exceptChatId: string;
  readonly limit: number;
}

export function callTextsOfSource(context: StoreContext, query: CallTextQuery): CallText[] {
  return context.sql.all(
    CALL_TEXT,
    `select m.created_at as at, m.text as text from assistant_messages m
     join ai_chats c on c.id = m.chat_id
     where c.profile_id = $profile and c.source_key = $source and c.archived_at is null
       and c.id <> $except and m.kind = 'call' and m.text <> ''
     order by m.created_at desc, m.rowid desc limit $limit`,
    {
      profile: query.profileId,
      source: query.sourceKey,
      except: query.exceptChatId,
      limit: query.limit,
    },
  );
}
