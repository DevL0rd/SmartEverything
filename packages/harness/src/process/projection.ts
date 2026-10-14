import { ProcessContextProjection, contextInput } from './projection-context';
import { projectNativeSessionChange } from './projection-session-change';
import { projectAssistantStream } from './assistant-stream';
import { ProcessTurnCorrelation } from './turn-correlation';
import { nativeToolText, nativeToolOutput, toolSummary } from './tool-result-output';
import { ProcessPublication } from './publication';
import { HarnessRuntimeError } from '../host/errors';
import { ProcessTaskQueue } from './task-queue';
import { supplierFacts, cacheFacts } from './projection-usage';
import type { TokenUsage } from '@deepseek-ai/dsh-llm';
import { z } from 'zod';
import { SessionId, isReplacementSurfaceEvent } from '@deepseek-ai/dsh-session';
import { readNativeHistory } from './history';
import {
  JSON_VALUE,
  harnessContextPercent,
  AI_HARNESS_EVENT,
  AI_HARNESS_SESSION,
  DSH_SESSION_ID,
} from '@smarteverything/domain';
import type {
  AiHarnessEvent,
  AiHarnessSession,
  AiHarnessInteraction,
  AiHarnessPermission,
  HarnessRuntimeRequest,
} from '@smarteverything/domain';
import type { HarnessRuntimeEvent } from '../host/events';
import type { HarnessControlPersistence } from './contracts';
export class ProcessProjection {
  private readonly correlation = new ProcessTurnCorrelation();
  private readonly sessions = new Map<string, AiHarnessSession>();
  private readonly seqs = new Map<string, number>();
  private readonly tools = new Map<string, string>();
  private readonly contexts = new Map<string, ProcessContextProjection>();
  private readonly tasks: ProcessTaskQueue;
  private readonly publication: ProcessPublication;
  idle: (id: string) => Promise<void> = () => Promise.resolve();
  workFor: (id: string) => readonly AiHarnessSession['work'][number][] = () => [];
  constructor(
    private readonly persistence: HarnessControlPersistence,
    publish: (event: AiHarnessEvent) => Promise<void>,
    private readonly interactionsFor: (id: string) => readonly AiHarnessInteraction[],
  ) {
    this.publication = new ProcessPublication(publish);
    this.tasks = new ProcessTaskQueue((id) => this.publication.attempt(id));
  }
  async open(input: Extract<HarnessRuntimeRequest, { kind: 'open' }>): Promise<void> {
    const metadata = await this.persistence.metadata(input.claim.session_id);
    this.sessions.set(
      input.claim.session_id,
      AI_HARNESS_SESSION.parse({
        chat_id: input.chat_id,
        session_id: input.claim.session_id,
        metadata,
        target: input.claim.target,
        epoch: input.claim.epoch,
        directory: { target: input.claim.target, path: input.cwd },
        ...(input.storage_binding === undefined ? {} : { storage_binding: input.storage_binding }),
        permission: input.permission,
        route: input.route,
        state: 'idle',
        interactions: [],
        work: [],
        handoff: null,
        failure: null,
      }),
    );
    this.seqs.set(input.claim.session_id, 0);
    const context = new ProcessContextProjection();
    this.contexts.set(input.claim.session_id, context);
    for (const event of readNativeHistory(
      metadata.header,
      await this.persistence.read(SessionId(input.claim.session_id)),
    )) {
      context.record(event);
      this.correlation.record(input.claim.session_id, event);
      if (event.type === 'tool/call') {
        const call = z.object({ callId: z.string(), name: z.string() }).parse(event.data);
        this.tools.set(call.callId, call.name);
      }
    }
    await this.contextState(input.claim.session_id, 'restored');
  }
  deviceWorkspace(id: string, binding: AiHarnessSession['storage_binding']): void {
    this.tasks.keep(id, () => {
      const session = this.sessions.get(id);
      if (session !== undefined && binding !== undefined)
        this.sessions.set(id, { ...session, storage_binding: binding });
      return Promise.resolve();
    });
  }
  event(event: HarnessRuntimeEvent): void {
    this.tasks.keep(event.sessionId, () => this.project(event));
  }
  interaction = (id: string, interaction: AiHarnessInteraction | null): void => {
    this.tasks.keep(id, () => {
      const session = this.sessions.get(id);
      if (session === undefined) return Promise.resolve();
      return interaction === null
        ? this.send(id, { kind: 'state', session })
        : this.send(id, { kind: 'interaction', interaction });
    });
  };
  async permission(
    id: string,
    operationId: string,
    permission: AiHarnessPermission,
  ): Promise<void> {
    await this.flush(id);
    const metadata = await this.persistence.metadata(id);
    const session = this.sessions.get(id);
    if (session === undefined)
      throw new HarnessRuntimeError(
        'ownership_lost',
        'Permission update has no opened native session.',
      );
    const updated = { ...session, permission, metadata };
    this.sessions.set(id, updated);
    await this.send(id, { kind: 'state', session: updated, permission_operation_id: operationId });
  }
  async flush(id?: string): Promise<void> {
    const results = await Promise.allSettled(
      (id === undefined ? this.tasks.ids() : [id]).map(async (sessionId): Promise<void> => {
        await this.tasks.flush(sessionId);
        await this.publication.flush(sessionId);
      }),
    );
    const rejected = results.find((result) => result.status === 'rejected');
    if (rejected?.status === 'rejected') throw rejected.reason;
  }
  async admit(id: string): Promise<void> {
    await this.flush(id);
    this.publication.admit(id, this.correlation.identity(id));
  }
  close(id: string): void {
    this.sessions.delete(id);
    this.correlation.close(id);
    this.publication.close(id);
    this.seqs.delete(id);
    this.contexts.delete(id);
  }
  private project(event: HarnessRuntimeEvent): Promise<void> {
    if (!this.sessions.has(event.sessionId)) return Promise.resolve();
    switch (event.kind) {
      case 'session':
        return this.projectSession(event);

      case 'input':
        return this.claimed(event);
      case 'discarded':
        return this.discarded(event);
      case 'stream':
        return this.stream(event);
      case 'status':
        return this.status(event);
      case 'commands': {
        const session = this.sessions.get(event.sessionId);
        if (session === undefined) return Promise.resolve();
        const updated = { ...session, commands_revision: event.revision };
        this.sessions.set(event.sessionId, updated);
        return this.send(event.sessionId, { kind: 'state', session: updated });
      }
      case 'error':
        return this.send(event.sessionId, {
          kind: 'failed',
          failure: {
            code: 'operation_failed',
            message: event.failure.message.slice(0, 2000),
            retry_at: null,
          },
        });
    }
  }
  private async projectSession(
    event: Extract<HarnessRuntimeEvent, { kind: 'session' }>,
  ): Promise<void> {
    if (this.contexts.get(event.sessionId)?.record(event.event) === true)
      await this.contextState(
        event.sessionId,
        event.event.type === 'assistant/message' || event.event.type === 'assistant/attempt'
          ? 'measured'
          : 'changed',
      );
    await this.sessionChange(event);
  }
  private sessionChange(event: Extract<HarnessRuntimeEvent, { kind: 'session' }>): Promise<void> {
    return projectNativeSessionChange(
      event,
      this.workFor,
      (record) => this.native(record),
      (status) => this.status(status),
    );
  }
  private contextState(id: string, update: 'measured' | 'changed' | 'restored'): Promise<void> {
    const session = this.sessions.get(id);
    const context = this.contexts.get(id);
    if (session === undefined || context === undefined) return Promise.resolve();
    const updated = { ...session, context: context.value };
    this.sessions.set(id, updated);
    return this.send(id, { kind: 'state', session: updated, context_update: update });
  }
  private native(event: Extract<HarnessRuntimeEvent, { kind: 'session' }>): Promise<void> {
    const record = event.event;
    if (isReplacementSurfaceEvent(record)) return Promise.resolve();
    this.correlation.record(event.sessionId, record);
    if (record.type === 'turn/end') return this.ended(event.sessionId, record);
    if (record.type === 'llm/retry' || record.type === 'llm/retry-started')
      return this.reconnecting(event.sessionId, record.type === 'llm/retry');
    if (record.type === 'working-directory/change')
      return this.directory(event.sessionId, record.data.cwd);
    if (record.type === 'tool/call') {
      this.tools.set(record.data.callId, record.data.name);
      return this.tool(event.sessionId, {
        call_id: record.data.callId,
        name: record.data.name,
        state: 'running',
        detail: null,
        input: record.data.arguments,
      });
    }
    if (record.type === 'tool/result') return this.toolResult(event.sessionId, record.data);
    return Promise.resolve();
  }
  private reconnecting(id: string, reconnecting: boolean): Promise<void> {
    const session = this.sessions.get(id);
    if (session === undefined) return Promise.resolve();
    const updated = { ...session, reconnecting };
    this.sessions.set(id, updated);
    return this.send(id, { kind: 'state', session: updated });
  }
  private directory(id: string, path: string): Promise<void> {
    const session = this.sessions.get(id);
    if (session === undefined) return Promise.resolve();
    const updated = { ...session, directory: { target: session.target, path } };
    this.sessions.set(id, updated);
    return this.send(id, { kind: 'state', session: updated });
  }
  private claimed(event: Extract<HarnessRuntimeEvent, { kind: 'input' }>): Promise<void> {
    const session = this.sessions.get(event.sessionId);
    if (session === undefined || !this.correlation.claimed(event)) return Promise.resolve();
    return this.send(event.sessionId, { kind: 'state', session });
  }
  private async discarded(
    event: Extract<HarnessRuntimeEvent, { kind: 'discarded' }>,
  ): Promise<void> {
    if (!this.correlation.discarded(event.sessionId, event.messageId)) return;
    await this.idle(event.sessionId);
    const metadata = await this.persistence.metadata(event.sessionId);
    await this.send(event.sessionId, {
      kind: 'completed',
      delivery_id: event.messageId,
      input_discarded: true,
      interrupted: true,
      durable_seq: metadata.durable_seq,
    });
  }
  private async ended(
    id: string,
    record: Extract<
      Extract<HarnessRuntimeEvent, { kind: 'session' }>['event'],
      { type: 'turn/end' }
    >,
  ): Promise<void> {
    if (this.correlation.ended(id, record.data.turn) === undefined) return;
    await this.idle(id);
    const metadata = await this.persistence.metadata(id);
    const reason = record.data.reason.kind;
    await this.send(
      id,
      reason === 'blocked' || reason === 'error'
        ? {
            kind: 'failed',
            failure: {
              code: 'operation_failed',
              message: 'Native turn failed or was blocked.',
              retry_at: null,
            },
          }
        : {
            kind: 'completed',
            interrupted: reason === 'aborted' || reason === 'interrupted',
            durable_seq: Math.min(metadata.durable_seq, record.seq),
          },
    );
    this.correlation.finish(id);
  }
  private toolResult(
    id: string,
    result: Extract<
      Extract<HarnessRuntimeEvent, { kind: 'session' }>['event'],
      { type: 'tool/result' }
    >['data'],
  ): Promise<void> {
    const message = result.message;
    const name = this.tools.get(message.toolCallId);
    if (name === undefined)
      throw new Error('Native tool result has no original retained call identity.');
    const detail = nativeToolText(message.content);
    return this.tool(id, {
      call_id: message.toolCallId,
      name,
      state: message.isError === true ? 'failed' : 'completed',
      detail: toolSummary(detail, 16_000),
      output: nativeToolOutput(result),
    });
  }
  private stream(event: Extract<HarnessRuntimeEvent, { kind: 'stream' }>): Promise<void> {
    return projectAssistantStream(event, this.sessions.get(event.sessionId), {
      send: (body): Promise<void> => this.send(event.sessionId, body),
      usage: (usage): Promise<void> => this.usage(event.sessionId, usage),
    });
  }
  private async usage(id: string, usage: TokenUsage): Promise<void> {
    const input = contextInput(usage);
    const context = this.contexts.get(id);
    context?.measure(usage);
    await this.contextState(id, 'measured');
    await this.send(id, {
      kind: 'usage',
      usage: {
        input_tokens: input,
        output_tokens: usage.outputTokens,
        total_tokens: usage.totalTokens ?? null,
        ...supplierFacts(usage),
        ...cacheFacts(usage),
        duration_ms: null,
        tool_uses: null,
      },
      context_percent: context === undefined ? null : harnessContextPercent(context.value),
    });
  }
  private async status(event: Extract<HarnessRuntimeEvent, { kind: 'status' }>): Promise<void> {
    const session = this.sessions.get(event.sessionId);
    if (session === undefined) return;
    if (event.status === 'idle') await this.idle(event.sessionId);
    const metadata = await this.persistence.metadata(event.sessionId);
    const work = [...this.workFor(event.sessionId)];
    const updated = {
      ...session,
      metadata,
      ...(event.status === 'idle' ? { reconnecting: false } : {}),
      state:
        event.status === 'running'
          ? ('working' as const)
          : work.length > 0
            ? ('waiting' as const)
            : ('idle' as const),
      work,
    };
    this.sessions.set(event.sessionId, updated);
    await this.send(event.sessionId, { kind: 'state', session: updated });
  }
  private tool(
    id: string,
    data: Pick<
      Extract<AiHarnessEvent, { kind: 'tool' }>,
      'call_id' | 'name' | 'state' | 'detail' | 'input' | 'output'
    >,
  ): Promise<void> {
    const session = this.sessions.get(id);
    if (session === undefined) return Promise.resolve();
    return this.send(id, { kind: 'tool', ...data, target: session.target });
  }
  private currentInteractions(event: AiHarnessEvent): AiHarnessEvent {
    if (event.kind !== 'state') return event;
    const session = { ...event.session, interactions: [...this.interactionsFor(event.session_id)] };
    this.sessions.set(event.session_id, session);
    return { ...event, session };
  }
  private send(id: string, event: unknown): Promise<void> {
    const session = this.sessions.get(id);
    if (session?.epoch === null || session === undefined) return Promise.resolve();
    const seq = this.seqs.get(id);
    if (seq === undefined) return Promise.resolve();
    this.seqs.set(id, seq + 1);
    const body = z.record(z.string(), JSON_VALUE).parse(event);
    const correlation =
      body['input_discarded'] === true ? undefined : this.correlation.identity(id);
    this.publication.keep(
      this.currentInteractions(
        AI_HARNESS_EVENT.parse({
          session_id: DSH_SESSION_ID.parse(id),
          chat_id: session.chat_id,
          epoch: session.epoch,
          seq,
          ...correlation,
          ...body,
        }),
      ),
    );
    return Promise.resolve();
  }
}
export { projectHarnessWork } from './work-projection';
