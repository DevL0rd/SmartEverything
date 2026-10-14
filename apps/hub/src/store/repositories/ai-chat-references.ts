import { z } from 'zod';
import { AI_CHAT_KINDS } from '@smarteverything/domain';
import { storedRow } from '../codec';
import type { StoreContext } from '../context';

const REFERENCE_TITLE = storedRow(
  z.strictObject({
    id: z.uuid(),
    title: z.string(),
    kind: z.enum(AI_CHAT_KINDS),
    archived: z.boolean(),
  }),
  { flags: ['archived'] },
);
export type ChatReferenceTitle = z.output<typeof REFERENCE_TITLE>;
export interface ChatReferenceTitleQuery {
  readonly profileId: string;
  readonly after: string | null;
  readonly limit: number;
}
export function referenceTitles(
  context: StoreContext,
  query: ChatReferenceTitleQuery,
): ChatReferenceTitle[] {
  return context.sql.all(
    REFERENCE_TITLE,
    `select id, title, kind, (archived_at is not null) as archived
     from ai_chats where profile_id = $profile and deletion_state is null and id > $after
     order by id limit $limit`,
    { profile: query.profileId, after: query.after ?? '', limit: query.limit },
  );
}

export interface ChatReferenceMessage {
  readonly profileId: string;
  readonly chatId: string;
  readonly messageId: string;
}
const REFERENCE_MESSAGE = z.strictObject({ id: z.uuid() });
export function ownsReferenceMessage(context: StoreContext, query: ChatReferenceMessage): boolean {
  return (
    context.sql.get(
      REFERENCE_MESSAGE,
      'select id from assistant_messages where id = $message and chat_id = $chat and profile_id = $profile',
      { message: query.messageId, chat: query.chatId, profile: query.profileId },
    ) !== undefined
  );
}
