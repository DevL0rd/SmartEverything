import { z } from 'zod';
import { storedRow } from '../codec';
import { found, type StoreContext } from '../context';
import { assertQueuedChatWork, holdQueuedChatWork } from './ai-chat-removal-hold';

const ASSISTANT_EVENT_KINDS = ['chat', 'voice', 'plugin', 'wake', 'report'] as const;

const MOMENT = z.iso.datetime({ offset: true });

const STORED_EVENT = storedRow(
  z.strictObject({
    cursor: z.int().min(1),
    id: z.uuid(),
    kind: z.enum(ASSISTANT_EVENT_KINDS),
    chat_id: z.uuid(),
    message_id: z.uuid().nullable(),
    profile_id: z.uuid(),
    client_id: z.uuid().nullable(),
    text: z.string(),
    received_at: MOMENT,
    delivered_at: MOMENT.nullable(),
    answered_at: MOMENT.nullable(),
    report_to: z.uuid().nullable(),
    helper_parent_message_id: z.uuid().nullable().optional(),
    helper_quote_text: z.string().nullable().optional(),
    hops: z.int().min(0),
  }),
  {},
);

export type StoredEvent = z.output<typeof STORED_EVENT>;

export type NewEvent = Pick<
  StoredEvent,
  'id' | 'kind' | 'chat_id' | 'message_id' | 'profile_id' | 'client_id' | 'text'
> &
  Partial<
    Pick<StoredEvent, 'report_to' | 'hops' | 'helper_parent_message_id' | 'helper_quote_text'>
  >;

const EVENT_COLUMNS =
  'cursor, id, kind, chat_id, message_id, profile_id, client_id, text, received_at, delivered_at, answered_at, report_to, hops, helper_parent_message_id, helper_quote_text';

const HOPS = z.strictObject({ hops: z.int().min(0) });

const ROOT = z.strictObject({ root: z.uuid() });

const UNSETTLED = z.strictObject({ unsettled: z.int().min(0).max(1) });

function chatHasUnsettledWork(context: StoreContext, chatId: string): boolean {
  const row = context.sql.get(
    UNSETTLED,
    `select (
      exists(select 1 from assistant_events where chat_id=$chat and answered_at is null)
      or exists(select 1 from harness_operations o join dsh_sessions s using(session_id)
        where s.chat_id=$chat and o.state<>'completed')
      or exists(select 1 from harness_deliveries d join dsh_sessions s using(session_id)
        where s.chat_id=$chat and d.state<>'completed')
    ) as unsettled`,
    { chat: chatId },
  );
  if (row === undefined) throw new Error('Chat work admission did not return its required state.');
  return row.unsettled === 1;
}

export class AssistantEventsRepository {
  constructor(private readonly context: StoreContext) {}

  add(input: NewEvent): StoredEvent {
    return this.context.write(() => {
      assertQueuedChatWork(this.context, input.chat_id);
      this.context.sql.run(
        'queue the assistant request',
        `insert into assistant_events
           (id, kind, chat_id, message_id, profile_id, client_id, text, received_at, report_to, hops, helper_parent_message_id, helper_quote_text)
         values ($id, $kind, $chat, $message, $profile, $client, $text, $now, $report, $hops, $helperParent, $helperQuote)`,
        {
          id: input.id,
          kind: input.kind,
          chat: input.chat_id,
          message: input.message_id,
          profile: input.profile_id,
          client: input.client_id,
          text: input.text,
          now: this.context.now(),
          report: input.report_to ?? null,
          hops: input.hops ?? 0,
          helperParent: input.helper_parent_message_id ?? null,
          helperQuote: input.helper_quote_text ?? null,
        },
      );
      return this.event(input.id);
    });
  }

  holdQueuedWork(ids: readonly string[], work: () => Promise<void>): Promise<void> {
    return holdQueuedChatWork(this.context, ids, work);
  }

  hasUnsettledChatWork(chatId: string): boolean {
    return chatHasUnsettledWork(this.context, chatId);
  }

  find(id: string): StoredEvent | undefined {
    return this.context.sql.get(
      STORED_EVENT,
      `select ${EVENT_COLUMNS} from assistant_events where id = $id`,
      { id },
    );
  }

  event(id: string): StoredEvent {
    return found(
      this.context.sql.get(
        STORED_EVENT,
        `select ${EVENT_COLUMNS} from assistant_events where id = $id`,
        { id },
      ),
      'assistant request',
      id,
    );
  }

  ofMessage(messageId: string): StoredEvent | undefined {
    return this.context.sql.get(
      STORED_EVENT,
      `select ${EVENT_COLUMNS} from assistant_events
       where message_id = $message and kind in ('chat', 'plugin') order by cursor desc limit 1`,
      { message: messageId },
    );
  }

  pending(): StoredEvent[] {
    return this.context.sql.all(
      STORED_EVENT,
      `select ${EVENT_COLUMNS} from assistant_events
       where delivered_at is null and answered_at is null order by cursor`,
    );
  }

  pendingSubagentRoots(): string[] {
    return this.context.sql
      .all(
        ROOT,
        `with recursive lineage(event_cursor, chat_id, parent_id, kind) as (
           select e.cursor, c.id, c.parent_id, c.kind
           from assistant_events e join ai_chats c on c.id = e.chat_id
           where e.delivered_at is null and e.answered_at is null and c.kind = 'subagent'
           union all
           select l.event_cursor, c.id, c.parent_id, c.kind
           from lineage l join ai_chats c on c.id = l.parent_id
           where l.kind = 'subagent' and l.parent_id is not null
         )
         select chat_id as root from lineage
         where not (kind = 'subagent' and parent_id is not null)
         order by event_cursor`,
      )
      .map((row) => row.root);
  }

  abandoned(): StoredEvent[] {
    return this.context.sql.all(
      STORED_EVENT,
      `select ${EVENT_COLUMNS} from assistant_events
       where delivered_at is not null and answered_at is null order by cursor`,
    );
  }

  settledHelperEvents(): StoredEvent[] {
    return this.context.sql.all(
      STORED_EVENT,
      `select ${EVENT_COLUMNS} from assistant_events
       where helper_parent_message_id is not null
       and exists (select 1 from assistant_messages
         where id=assistant_events.helper_parent_message_id and state is null)
       and (answered_at is not null or exists (select 1 from assistant_messages
         where id=assistant_events.message_id and state in ('answered', 'failed'))
       or exists (select 1 from assistant_messages
         where reply_to=assistant_events.message_id and role='responder' and state='answered'))`,
    );
  }

  currentHops(chatId: string): number {
    const row = this.context.sql.get(
      HOPS,
      `select hops from assistant_events
       where chat_id = $chat and delivered_at is not null and answered_at is null
       order by cursor desc limit 1`,
      { chat: chatId },
    );
    return row?.hops ?? 0;
  }

  mark(id: string, column: 'delivered_at' | 'answered_at'): void {
    this.context.write(() => {
      this.context.sql.run(
        'mark the assistant request',
        `update assistant_events set ${column} = coalesce(${column}, $now) where id = $id`,
        { id, now: this.context.now() },
      );
    });
  }
}
