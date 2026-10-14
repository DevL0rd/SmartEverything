import { z } from 'zod';
import { storedRow } from '../codec';
import { found, type StoreContext } from '../context';
import { assertQueuedChatWork, holdQueuedChatWork } from './ai-chat-removal-hold';
import { chatHasUnsettledWork } from './ai-chat-work';

export const ASSISTANT_EVENT_KINDS = ['chat', 'voice', 'plugin', 'wake', 'report'] as const;

export type AssistantEventKind = (typeof ASSISTANT_EVENT_KINDS)[number];

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
