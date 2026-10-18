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
    hops: z.int().min(0),
  }),
  {},
);

export type StoredEvent = z.output<typeof STORED_EVENT>;

export type NewEvent = Pick<
  StoredEvent,
  'id' | 'kind' | 'chat_id' | 'message_id' | 'profile_id' | 'client_id' | 'text'
> &
  Partial<Pick<StoredEvent, 'report_to' | 'hops'>>;

const EVENT_COLUMNS =
  'cursor, id, kind, chat_id, message_id, profile_id, client_id, text, received_at, delivered_at, answered_at, report_to, hops';

const COUNT = z.strictObject({ count: z.int().min(0) });

const LATEST = z.strictObject({ at: MOMENT.nullable() });

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
      or exists(select 1 from harness_children c join dsh_sessions s
        on s.session_id=c.parent_session or s.session_id=c.child_session
        where s.chat_id=$chat and (c.state not in ('completed','failed') or c.delivered=0))
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
           (id, kind, chat_id, message_id, profile_id, client_id, text, received_at, report_to, hops)
         values ($id, $kind, $chat, $message, $profile, $client, $text, $now, $report, $hops)`,
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

  personAt(chatId: string): string | null {
    const row = this.context.sql.get(
      LATEST,
      `select max(received_at) as at from assistant_events
       where chat_id = $chat and kind in ('chat', 'voice') and hops = 0`,
      { chat: chatId },
    );
    return row?.at ?? null;
  }

  aiArrivals(chatId: string, since: string): number {
    const row = this.context.sql.get(
      COUNT,
      `select count(*) as count from assistant_events
       where chat_id = $chat and received_at > $since and (hops > 0 or kind = 'report')`,
      { chat: chatId, since },
    );
    return row?.count ?? 0;
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
