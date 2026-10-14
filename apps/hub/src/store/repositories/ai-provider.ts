import {
  AI_CHAT_PROVIDER,
  AI_SUBSCRIPTION_USAGE,
  type AiSubscriptionUsage,
  JSON_VALUE,
  AI_ENGINE_PREFERENCE,
  PROVIDER_EVENT,
  PROVIDER_METADATA,
  type AiChatProvider,
  type ProviderEvent,
  type ProviderMetadata,
  type ComputerAiRuntime,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { StoreContext } from '../context';
import { storedRow } from '../codec';
import { jsonText, SQL_JSON } from '../sql';
import {
  KEPT_PROVIDER_EVENTS,
  KEPT_PROVIDER_EVENT_BYTES,
  retainProviderEvents,
} from '../ai-provider-retention';

const STATE = storedRow(AI_CHAT_PROVIDER.omit({ events: true, subscription_usage: true }), {
  json: ['metadata', 'prompts'],
});
const EVENT = z.strictObject({ event: SQL_JSON.pipe(PROVIDER_EVENT) });
const COLUMNS = 'device_id, session_id, job_id, state, reason, metadata, prompts';

export class AiProviderRepository {
  private restartInvalidated = false;
  constructor(private readonly context: StoreContext) {}

  read(chatId: string, includeEvents = true): AiChatProvider | null {
    const row = this.context.sql.get(
      STATE,
      `select ${COLUMNS} from ai_provider_chats where chat_id = $chat and runtime = 'claude'`,
      { chat: chatId },
    );
    if (row === undefined) return null;
    if (!includeEvents) return { ...row, events: [], ...this.subscriptionUsage(chatId) };
    const events = this.context.sql
      .all(
        EVENT,
        'select event from ai_provider_events where chat_id = $chat order by created_at desc, rowid desc limit $limit',
        { chat: chatId, limit: KEPT_PROVIDER_EVENTS },
      )
      .map((item) => item.event)
      .reverse();
    return { ...row, events, ...this.subscriptionUsage(chatId) };
  }

  save(chatId: string, state: AiChatProvider): void {
    const row = AI_CHAT_PROVIDER.parse(state);
    this.context.sql.run(
      'save the chat provider session',
      `insert into ai_provider_chats(chat_id, ${COLUMNS}, updated_at)
       values($chat, $device, $session, $job, $state, $reason, $metadata, $prompts, $now)
       on conflict(chat_id) do update set runtime='claude', effective_cwd=case when ai_provider_chats.job_id is excluded.job_id then ai_provider_chats.effective_cwd else null end, process_generation=case when ai_provider_chats.job_id is excluded.job_id then ai_provider_chats.process_generation else null end, device_id=excluded.device_id, session_id=excluded.session_id,
       event_seq=case when ai_provider_chats.job_id is excluded.job_id then ai_provider_chats.event_seq else 0 end,
       job_id=excluded.job_id, state=excluded.state, reason=excluded.reason, metadata=excluded.metadata,
       prompts=excluded.prompts, updated_at=excluded.updated_at`,
      {
        chat: chatId,
        device: row.device_id,
        session: row.session_id,
        job: row.job_id,
        state: row.state,
        reason: row.reason,
        metadata: row.metadata === null ? null : jsonText(row.metadata),
        prompts: jsonText(row.prompts),
        now: this.context.now(),
      },
    );
    this.saveSubscriptionUsage(chatId, row.subscription_usage);
    if (row.session_id !== null) this.associate(chatId, row.device_id, row.session_id);
  }

  subscriptionUsage(chatId: string): Pick<AiChatProvider, 'subscription_usage'> {
    const row = this.context.sql.get(
      z.object({ subscription_usage: SQL_JSON.nullable() }),
      'select subscription_usage from ai_provider_chats where chat_id=$chat',
      { chat: chatId },
    );
    return row?.subscription_usage === null || row?.subscription_usage === undefined
      ? {}
      : { subscription_usage: AI_SUBSCRIPTION_USAGE.parse(row.subscription_usage) };
  }
  saveSubscriptionUsage(chatId: string, usage: AiSubscriptionUsage | undefined): void {
    this.context.sql.run(
      'retain subscription usage separately from estimated cost',
      'update ai_provider_chats set subscription_usage=$usage where chat_id=$chat',
      {
        chat: chatId,
        usage: usage === undefined ? null : jsonText(AI_SUBSCRIPTION_USAGE.parse(usage)),
      },
    );
  }

  associate(
    chatId: string,
    deviceId: string,
    sessionId: string,
    runtime: ComputerAiRuntime = 'claude',
  ): void {
    this.context.sql.run(
      'associate the native session with its chat and computer',
      'insert or ignore into ai_provider_sessions(chat_id,device_id,runtime,session_id) values($chat,$device,$runtime,$session)',
      { chat: chatId, device: deviceId, session: sessionId, runtime },
    );
  }

  forgetSession(
    chatId: string,
    deviceId: string,
    sessionId: string,
    runtime: ComputerAiRuntime = 'claude',
  ): void {
    this.context.sql.run(
      'forget the deleted native session association',
      'delete from ai_provider_sessions where chat_id=$chat and device_id=$device and runtime=$runtime and session_id=$session',
      { chat: chatId, device: deviceId, session: sessionId, runtime },
    );
  }

  ownsSession(
    chatId: string,
    deviceId: string,
    sessionId: string,
    runtime: ComputerAiRuntime = 'claude',
  ): boolean {
    return (
      this.context.sql.get(
        z.strictObject({ session_id: z.string() }),
        'select session_id from ai_provider_sessions where chat_id=$chat and device_id=$device and runtime=$runtime and session_id=$session',
        { chat: chatId, device: deviceId, session: sessionId, runtime },
      ) !== undefined
    );
  }

  append(chatId: string, event: ProviderEvent): boolean {
    const parsed = PROVIDER_EVENT.parse(event);
    return this.context.write(() => this.keep(chatId, parsed));
  }

  private keep(chatId: string, event: ProviderEvent): boolean {
    const updated = this.context.sql.run(
      'advance the durable provider event cursor',
      'update ai_provider_chats set event_seq=$seq where chat_id=$chat and job_id=$job and event_seq<$seq',
      { chat: chatId, job: event.job_id, seq: event.seq },
    );
    if (updated === 0) return false;
    const retained = retainedEvent(event);
    if (retained === null) return true;
    const encoded = jsonText(retained);
    if (Buffer.byteLength(encoded, 'utf8') > KEPT_PROVIDER_EVENT_BYTES) return true;
    this.context.sql.run(
      'keep the normalized provider event',
      'insert into ai_provider_events(job_id, seq, chat_id, event, created_at) values($job, $seq, $chat, $event, $now)',
      {
        job: event.job_id,
        seq: event.seq,
        chat: chatId,
        event: encoded,
        now: this.context.now(),
      },
    );
    retainProviderEvents(this.context.sql, chatId);
    return true;
  }

  submitted(messageId: string | null): boolean {
    if (messageId === null) return false;
    return (
      this.context.sql.get(
        z.strictObject({ job_id: z.string() }),
        'select job_id from ai_provider_turns where message_id=$message',
        { message: messageId },
      ) !== undefined
    );
  }

  submitting(chatId: string, messageId: string | null, jobId: string): void {
    if (messageId === null) return;
    this.context.sql.run(
      'record the explicit provider submission',
      `insert into ai_provider_turns(message_id,chat_id,job_id,created_at) values($message,$chat,$job,$now)
       on conflict(message_id) do update set job_id=excluded.job_id`,
      { message: messageId, chat: chatId, job: jobId, now: this.context.now() },
    );
  }

  metadata(chatId: string, metadata: ProviderMetadata): void {
    const row = this.read(chatId);
    if (row !== null) this.save(chatId, { ...row, metadata: PROVIDER_METADATA.parse(metadata) });
  }

  interruptRestart(): void {
    if (this.restartInvalidated) return;
    this.restartInvalidated = true;
    this.context.sql.run(
      'expire abandoned provider jobs',
      `update ai_provider_chats set state='failed', job_id=null, reason=$reason,
       prompts=json('[]') where job_id is not null`,
      {
        reason:
          'The hub restarted. The saved session remains available for an explicit new turn; previous work was not resubmitted.',
      },
    );
  }

  preferences(): z.infer<typeof AI_ENGINE_PREFERENCE>[] {
    return this.context.sql.all(
      AI_ENGINE_PREFERENCE,
      "select model, device_id from ai_engine_preferences where runtime='claude' order by model",
    );
  }

  prefer(model: string, deviceId: string): z.infer<typeof AI_ENGINE_PREFERENCE> {
    const row = AI_ENGINE_PREFERENCE.parse({ model, device_id: deviceId });
    this.context.sql.run(
      'save the supplying computer for the model',
      `insert into ai_engine_preferences(runtime,model,device_id,updated_at) values('claude',$model,$device,$now)
       on conflict(runtime,model) do update set device_id=excluded.device_id,updated_at=excluded.updated_at`,
      { model: row.model, device: row.device_id, now: this.context.now() },
    );
    return row;
  }
}

function retainedEvent(event: ProviderEvent): ProviderEvent | null {
  if (event.kind !== 'runtime') return event;
  if (event.type === 'stream_event') return null;
  if (event.type !== 'assistant') return event;
  const message = z.record(z.string(), JSON_VALUE).safeParse(event.payload['message']);
  if (!message.success) return event;
  const content = z.array(JSON_VALUE).safeParse(message.data['content']);
  if (!content.success) return event;
  const tools = content.data.filter(
    (block) => z.object({ type: z.literal('tool_use') }).safeParse(block).success,
  );
  if (tools.length === 0) return null;
  return { ...event, payload: { ...event.payload, message: { ...message.data, content: tools } } };
}
