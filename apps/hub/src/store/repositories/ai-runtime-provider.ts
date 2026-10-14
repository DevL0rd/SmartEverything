import { z } from 'zod';
import {
  AI_CHAT_RUNTIME_PROVIDER,
  NATIVE_MANAGED_PROJECT,
  ApiError,
  AI_RUNTIME_ENGINE_PREFERENCE,
  COMPUTER_RUNTIME_PROVIDER_EVENT,
  type AiChatRuntimeProvider,
  type AiRuntimeEnginePreference,
  type ComputerRuntimeProviderEvent,
  type ComputerAiRuntime,
} from '@smarteverything/domain';
import type { StoreContext } from '../context';
import { SQL_JSON, jsonText } from '../sql';
import {
  retainProviderEvents,
  KEPT_PROVIDER_EVENTS,
  KEPT_PROVIDER_EVENT_BYTES,
} from '../ai-provider-retention';
import { AiProviderRepository } from './ai-provider';

const ROW = z.strictObject({
  runtime: z.enum(['claude', 'codex']),
  device_id: z.uuid(),
  session_id: z.string().nullable(),
  job_id: z.uuid().nullable(),
  state: z.string(),
  reason: z.string().nullable(),
  metadata: SQL_JSON.nullable(),
  prompts: SQL_JSON,
  effective_cwd: z.string().nullable(),
  process_generation: z.uuid().nullable(),
  managed_project: SQL_JSON.pipe(NATIVE_MANAGED_PROJECT).nullable(),
  context_managed_project: SQL_JSON.pipe(NATIVE_MANAGED_PROJECT).nullable(),
});
const EVENT = z.strictObject({ event: SQL_JSON });
export class AiRuntimeProviderRepository {
  constructor(private readonly context: StoreContext) {}
  read(chatId: string, includeEvents = true): AiChatRuntimeProvider | null {
    const row = this.context.sql.get(
      ROW,
      'select runtime,device_id,session_id,job_id,state,reason,metadata,prompts,effective_cwd,process_generation,managed_project,context_managed_project from ai_provider_chats where chat_id=$chat',
      { chat: chatId },
    );
    if (row === undefined) return null;
    if (row.runtime === 'claude') {
      const legacy = new AiProviderRepository(this.context).read(chatId, includeEvents);
      if (legacy === null) return null;
      return {
        ...legacy,
        runtime: 'claude',
        context: this.contextOf(row),
        ...(row.managed_project === null ? {} : { managed_project: row.managed_project }),
      };
    }
    const events = includeEvents
      ? this.context.sql
          .all(
            EVENT,
            'select event from ai_provider_events where chat_id=$chat order by created_at desc,rowid desc limit $limit',
            { chat: chatId, limit: KEPT_PROVIDER_EVENTS },
          )
          .map((item) => item.event)
          .reverse()
      : [];
    return AI_CHAT_RUNTIME_PROVIDER.parse({
      runtime: row.runtime,
      device_id: row.device_id,
      session_id: row.session_id,
      job_id: row.job_id,
      state: row.state,
      reason: row.reason,
      metadata: row.metadata,
      prompts: row.prompts,
      context: this.contextOf(row),
      ...(row.managed_project === null ? {} : { managed_project: row.managed_project }),
      events,
      ...new AiProviderRepository(this.context).subscriptionUsage(chatId),
    });
  }
  save(chatId: string, state: AiChatRuntimeProvider): void {
    const row = AI_CHAT_RUNTIME_PROVIDER.parse(state);
    this.context.write(() => {
      this.saveBinding(chatId, row);
    });
  }
  private saveBinding(chatId: string, row: AiChatRuntimeProvider): void {
    this.context.sql.run(
      'save runtime provider binding',
      `insert into ai_provider_chats(chat_id,runtime,device_id,session_id,job_id,state,reason,metadata,prompts,effective_cwd,process_generation,managed_project,context_managed_project,updated_at) values($chat,$runtime,$device,$session,$job,$state,$reason,$metadata,$prompts,$cwd,$generation,$project,$contextProject,$now) on conflict(chat_id) do update set runtime=excluded.runtime,device_id=excluded.device_id,session_id=excluded.session_id,event_seq=case when ai_provider_chats.job_id is excluded.job_id and ai_provider_chats.runtime is excluded.runtime then ai_provider_chats.event_seq else 0 end,job_id=excluded.job_id,state=excluded.state,reason=excluded.reason,metadata=excluded.metadata,prompts=excluded.prompts,effective_cwd=excluded.effective_cwd,process_generation=excluded.process_generation,managed_project=excluded.managed_project,context_managed_project=excluded.context_managed_project,updated_at=excluded.updated_at`,
      {
        chat: chatId,
        runtime: row.runtime,
        device: row.device_id,
        session: row.session_id,
        job: row.job_id,
        state: row.state,
        reason: row.reason,
        metadata: row.metadata === null ? null : jsonText(row.metadata),
        prompts: jsonText(row.prompts),
        cwd: row.context?.cwd ?? null,
        generation: row.context?.process_generation ?? null,
        project: this.projectOf(chatId, row),
        contextProject: this.contextProjectOf(row),
        now: this.context.now(),
      },
    );
    new AiProviderRepository(this.context).saveSubscriptionUsage(chatId, row.subscription_usage);
    if (row.session_id !== null)
      new AiProviderRepository(this.context).associate(
        chatId,
        row.device_id,
        row.session_id,
        row.runtime,
      );
  }
  append(chatId: string, input: ComputerRuntimeProviderEvent): boolean {
    const envelope = COMPUTER_RUNTIME_PROVIDER_EVENT.parse(input);
    if (envelope.runtime === 'claude')
      return new AiProviderRepository(this.context).append(chatId, envelope.event);
    return this.context.write(() => {
      const event = envelope.event;
      const updated = this.context.sql.run(
        'advance runtime provider sequence',
        "update ai_provider_chats set event_seq=$seq where chat_id=$chat and runtime='codex' and job_id=$job and event_seq<$seq and (process_generation is null or process_generation=$generation)",
        { chat: chatId, job: event.job_id, seq: event.seq, generation: event.process_generation },
      );
      if (updated === 0) return false;
      const encoded = jsonText(event);
      if (Buffer.byteLength(encoded, 'utf8') <= KEPT_PROVIDER_EVENT_BYTES)
        this.context.sql.run(
          'retain runtime provider event',
          'insert into ai_provider_events(job_id,seq,chat_id,event,created_at) values($job,$seq,$chat,$event,$now)',
          {
            chat: chatId,
            job: event.job_id,
            seq: event.seq,
            event: encoded,
            now: this.context.now(),
          },
        );
      retainProviderEvents(this.context.sql, chatId);
      return true;
    });
  }
  preferences(): AiRuntimeEnginePreference[] {
    return this.context.sql.all(
      AI_RUNTIME_ENGINE_PREFERENCE,
      'select runtime,model,device_id from ai_engine_preferences order by runtime,model',
    );
  }
  prefer(runtime: ComputerAiRuntime, model: string, deviceId: string): AiRuntimeEnginePreference {
    const row = AI_RUNTIME_ENGINE_PREFERENCE.parse({ runtime, model, device_id: deviceId });
    this.context.sql.run(
      'save runtime model source preference',
      'insert into ai_engine_preferences(runtime,model,device_id,updated_at) values($runtime,$model,$device,$now) on conflict(runtime,model) do update set device_id=excluded.device_id,updated_at=excluded.updated_at',
      { runtime, model, device: deviceId, now: this.context.now() },
    );
    return row;
  }
  private projectOf(chatId: string, row: AiChatRuntimeProvider): string | null {
    const project = row.managed_project ?? row.context?.managed_project;
    if (project === undefined) return null;
    if (project.chat_id !== chatId)
      throw new ApiError('forbidden', 'The native managed project belongs to another chat.');
    return jsonText(project);
  }
  private contextProjectOf(row: AiChatRuntimeProvider): string | null {
    const project = row.context?.managed_project;
    return project === undefined ? null : jsonText(project);
  }
  private contextOf(row: z.infer<typeof ROW>): AiChatRuntimeProvider['context'] {
    if (row.effective_cwd === null || row.process_generation === null) return null;
    return {
      runtime: row.runtime,
      device_id: row.device_id,
      session_id: row.session_id,
      cwd: row.effective_cwd,
      process_generation: row.process_generation,
      ...(row.context_managed_project === null
        ? {}
        : { managed_project: row.context_managed_project }),
    };
  }
}
