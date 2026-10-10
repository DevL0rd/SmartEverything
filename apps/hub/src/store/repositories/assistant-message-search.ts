import { chatActivitySql, type AssistantMessageRow } from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';
import type { StoreContext } from '../context';
import { flag } from '../sql';
import { MESSAGE_COLUMNS, STORED_MESSAGE } from './assistant-chat';

export interface MessageHit {
  readonly chat_id: string;
  readonly title: string;
  readonly archived: boolean;
  readonly id: string;
  readonly text: string;
  readonly at: string;
}

export interface MessageHitQuery {
  readonly profileId: string;
  readonly text: string;
  readonly chatId: string | null;
  readonly archived: boolean;
  readonly limit: number;
}

const MESSAGE_HIT = storedRow(
  z.strictObject({
    chat_id: z.uuid(),
    title: z.string(),
    archived: z.boolean(),
    id: z.uuid(),
    text: z.string(),
    at: z.iso.datetime({ offset: true }),
  }),
  { flags: ['archived'] },
);

const MESSAGE_TEXT = storedRow(z.strictObject({ text: z.string() }), {});

export class AssistantMessageSearchRepository {
  constructor(private readonly context: StoreContext) {}

  hits(query: MessageHitQuery): MessageHit[] {
    return this.context.sql.all(
      MESSAGE_HIT,
      `select m.chat_id as chat_id, c.title as title, (c.archived_at is not null) as archived,
              m.id as id, m.text as text, m.created_at as at
       from assistant_messages m join ai_chats c on c.id = m.chat_id
       where c.profile_id = $profile and instr(lower(m.text), lower($text)) > 0
         and ${chatActivitySql('m')} and ($chat is null or m.chat_id = $chat)
         and ($archived = 1 or c.archived_at is null)
       order by m.created_at desc, m.rowid desc limit $limit`,
      {
        profile: query.profileId,
        text: query.text,
        chat: query.chatId,
        archived: flag(query.archived),
        limit: query.limit,
      },
    );
  }

  byClientMessageId(chatId: string, clientMessageId: string): AssistantMessageRow | undefined {
    return this.context.sql.get(
      STORED_MESSAGE,
      `select ${MESSAGE_COLUMNS} from assistant_messages
       where chat_id = $chat and client_message_id = $clientMessage`,
      { chat: chatId, clientMessage: clientMessageId },
    );
  }

  upTo(chatId: string, messageId: string): AssistantMessageRow[] {
    return this.context.sql.all(
      STORED_MESSAGE,
      `select ${MESSAGE_COLUMNS} from assistant_messages
       where chat_id = $chat and (created_at, rowid) <= (
         select created_at, rowid from assistant_messages where id = $message)
       order by created_at, rowid`,
      { chat: chatId, message: messageId },
    );
  }

  firstText(
    chatId: string,
    role: AssistantMessageRow['role'],
    kind: AssistantMessageRow['kind'],
  ): string | null {
    return (
      this.context.sql.get(
        MESSAGE_TEXT,
        `select text from assistant_messages
         where chat_id = $chat and role = $role and kind = $kind and text <> ''
         order by created_at, rowid limit 1`,
        { chat: chatId, role, kind },
      )?.text ?? null
    );
  }
}
