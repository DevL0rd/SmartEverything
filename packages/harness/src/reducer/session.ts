import {
  AI_HARNESS_EVENT,
  AI_HARNESS_SESSION,
  harnessContextPercent,
} from '@smarteverything/domain';
import type {
  AiHarnessEvent,
  AiHarnessInteraction,
  AiHarnessSession,
  DshSessionMetadata,
  HarnessNativeFrame,
  HarnessNativeUsage,
} from '@smarteverything/domain';
import { ReducerContext, contextInput } from './context';
import { TurnCorrelation } from './correlation';
import { narrowNativeEvent } from './event';
import type { NativeBody, NativeEvent } from './event';
import { toolResultBody, turnEndBody } from './outcome';

interface SessionPorts {
  readonly metadata: () => DshSessionMetadata;
}
export interface SessionOpening {
  readonly session: AiHarnessSession;
  readonly history: readonly unknown[];
}
type Body = Record<string, unknown>;
type Kind = Exclude<HarnessNativeFrame['kind'], 'open' | 'close'>;
type Frames = { readonly [K in Kind]: Extract<HarnessNativeFrame, { kind: K }> };
type Frame<K extends Kind> = Frames[K];
type Handlers = { readonly [K in Kind]: (frame: Frames[K]) => readonly AiHarnessEvent[] };

export class SessionReducer {
  private session: AiHarnessSession;
  private seq = 0;
  private logged: number;
  private interactions: readonly AiHarnessInteraction[] = [];
  private readonly context = new ReducerContext();
  private readonly correlation = new TurnCorrelation();
  private readonly tools = new Map<string, string>();
  private readonly handlers: Handlers = {
    input: (frame) => this.input(frame),
    discarded: (frame) => this.discarded(frame),
    text: (frame) => [this.send({ kind: 'text', delta: frame.delta })],
    reasoning: (frame) => [this.send({ kind: 'reasoning', delta: frame.delta })],
    attempt: (frame) => [this.state({ assistant_attempt: { id: frame.id, state: frame.state } })],
    usage: (frame) => this.usage(frame.usage),
    status: (frame) => this.status(frame),
    commands: (frame) => this.commands(frame.revision),
    context: (frame) => this.estimate(frame.estimate),
    error: (frame) => this.error(frame.message),
    interactions: (frame) => this.interaction(frame),
    workspace: (frame) => this.workspace(frame.storage_binding),
    permission: (frame) => this.permission(frame),
  };

  constructor(
    private readonly ports: SessionPorts,
    opening: SessionOpening,
  ) {
    const {
      context: _context,
      context_request: _contextRequest,
      commands_revision: _commandsRevision,
      permission_change: _permissionChange,
      reconnecting: _reconnecting,
      ...retained
    } = opening.session;
    this.session = AI_HARNESS_SESSION.parse({
      ...retained,
      metadata: ports.metadata(),
      state: 'idle',
      interactions: [],
      work: [],
      failure: null,
    });
    for (const raw of opening.history) this.replay(narrowNativeEvent(raw));
    this.logged = opening.history.length;
  }

  restored(): readonly AiHarnessEvent[] {
    return [this.contextState('restored')];
  }

  apply<K extends Kind>(kind: K, frame: Frames[K]): readonly AiHarnessEvent[] {
    return this.handlers[kind](frame);
  }

  append(event: unknown): readonly AiHarnessEvent[] {
    const native = narrowNativeEvent(event);
    if (native.seq < this.logged) return [];
    this.logged = native.seq + 1;
    const events: AiHarnessEvent[] = [];
    if (this.context.record(native)) events.push(this.contextState(measuring(native.body)));
    if (native.replayed) {
      this.track(native);
      return events;
    }
    if (native.body.type === 'command/done' || native.body.type === 'compaction/end') return events;
    return [...events, ...this.native(native)];
  }

  private input(frame: Frame<'input'>): readonly AiHarnessEvent[] {
    if (!this.correlation.claimed(frame.message_id, frame.turn)) return [];
    return [this.state({})];
  }

  private discarded(frame: Frame<'discarded'>): readonly AiHarnessEvent[] {
    if (!this.correlation.discarded(frame.message_id)) return [];
    return [
      this.send({
        kind: 'completed',
        delivery_id: frame.message_id,
        input_discarded: true,
        interrupted: true,
        durable_seq: this.ports.metadata().durable_seq,
      }),
    ];
  }

  private usage(usage: HarnessNativeUsage): readonly AiHarnessEvent[] {
    this.context.measure(usage);
    return [
      this.contextState('measured'),
      this.send({
        kind: 'usage',
        usage: {
          input_tokens: contextInput(usage),
          output_tokens: usage.outputTokens,
          total_tokens: usage.totalTokens ?? null,
          cost_usd: null,
          cache_read_tokens: usage.cacheReadTokens ?? null,
          cache_write_tokens: usage.cacheWriteTokens ?? null,
          reasoning_tokens: usage.reasoningTokens ?? null,
          duration_ms: null,
          tool_uses: null,
        },
        context_percent: harnessContextPercent(this.context.value),
      }),
    ];
  }

  private status(frame: Frame<'status'>): readonly AiHarnessEvent[] {
    const waiting = frame.work.length > 0 ? ('waiting' as const) : ('idle' as const);
    this.session = {
      ...this.session,
      metadata: this.ports.metadata(),
      ...(frame.status === 'idle' ? { reconnecting: false } : {}),
      state: frame.status === 'running' ? 'working' : waiting,
      work: [...frame.work],
    };
    return [this.state({})];
  }

  private commands(revision: string): readonly AiHarnessEvent[] {
    this.session = { ...this.session, commands_revision: revision };
    return [this.state({})];
  }

  private estimate(tokens: number | null): readonly AiHarnessEvent[] {
    this.context.estimate(tokens);
    return [this.contextState('changed')];
  }

  private error(message: string): readonly AiHarnessEvent[] {
    return [
      this.send({
        kind: 'failed',
        failure: { code: 'operation_failed', message, retry_at: null },
      }),
    ];
  }

  private interaction(frame: Frame<'interactions'>): readonly AiHarnessEvent[] {
    this.interactions = frame.interactions;
    return [
      frame.added === null
        ? this.state({})
        : this.send({ kind: 'interaction', interaction: frame.added }),
    ];
  }

  private workspace(binding: Frame<'workspace'>['storage_binding']): readonly AiHarnessEvent[] {
    this.session = { ...this.session, storage_binding: binding };
    return [];
  }

  private permission(frame: Frame<'permission'>): readonly AiHarnessEvent[] {
    this.session = {
      ...this.session,
      permission: frame.permission,
      metadata: this.ports.metadata(),
    };
    return [this.state({ permission_operation_id: frame.operation_id })];
  }

  private replay(event: NativeEvent): void {
    this.context.record(event);
    this.track(event);
  }

  private track(event: NativeEvent): void {
    this.correlation.record(event.body);
    if (event.body.type === 'tool/call')
      this.tools.set(event.body.data.callId, event.body.data.name);
    if (event.body.type === 'tool/result') this.tools.delete(event.body.data.message.toolCallId);
  }

  private native(event: NativeEvent): readonly AiHarnessEvent[] {
    if (event.surface === 'replace') return [];
    const body = event.body;
    this.correlation.record(body);
    if (body.type === 'turn/end') return this.ended(body.data, event.seq);
    if (body.type === 'llm/retry') return [this.reconnecting(true)];
    if (body.type === 'llm/retry-started') return [this.reconnecting(false)];
    if (body.type === 'working-directory/change') return [this.directory(body.data.cwd)];
    if (body.type === 'tool/call') return this.toolCall(body.data);
    if (body.type === 'tool/result') return this.toolResult(body.data);
    return [];
  }

  private ended(
    data: Extract<NativeBody, { type: 'turn/end' }>['data'],
    seq: number,
  ): readonly AiHarnessEvent[] {
    if (this.correlation.ended(data.turn) === undefined) return [];
    const completion = this.send(turnEndBody(data, seq, this.ports.metadata().durable_seq));
    this.correlation.finish();
    return [completion];
  }

  private toolCall(
    data: Extract<NativeBody, { type: 'tool/call' }>['data'],
  ): readonly AiHarnessEvent[] {
    this.tools.set(data.callId, data.name);
    return [
      this.tool({
        call_id: data.callId,
        name: data.name,
        state: 'running',
        detail: null,
        input: data.arguments,
      }),
    ];
  }

  private toolResult(
    data: Extract<NativeBody, { type: 'tool/result' }>['data'],
  ): readonly AiHarnessEvent[] {
    const name = this.tools.get(data.message.toolCallId);
    if (name === undefined)
      throw new Error('Native tool result has no original retained call identity.');
    this.tools.delete(data.message.toolCallId);
    return [this.tool(toolResultBody(name, data))];
  }

  private tool(body: Body): AiHarnessEvent {
    return this.send({ kind: 'tool', ...body, target: this.session.target });
  }

  private reconnecting(active: boolean): AiHarnessEvent {
    this.session = { ...this.session, reconnecting: active };
    return this.state({});
  }

  private directory(path: string): AiHarnessEvent {
    this.session = { ...this.session, directory: { target: this.session.target, path } };
    return this.state({});
  }

  private contextState(update: 'measured' | 'changed' | 'restored'): AiHarnessEvent {
    this.session = { ...this.session, context: this.context.value };
    return this.state({ context_update: update });
  }

  private state(extra: Body): AiHarnessEvent {
    this.session = { ...this.session, interactions: [...this.interactions] };
    return this.send({ kind: 'state', session: this.session, ...extra });
  }

  private send(body: Body): AiHarnessEvent {
    const epoch = this.session.epoch;
    if (epoch === null) throw new Error('Native session has no admitted epoch.');
    const identity = body['input_discarded'] === true ? undefined : this.correlation.identity();
    const event = AI_HARNESS_EVENT.parse({
      session_id: this.session.session_id,
      chat_id: this.session.chat_id,
      epoch,
      seq: this.seq,
      ...identity,
      ...body,
    });
    this.seq += 1;
    return event;
  }
}

function measuring(body: NativeBody): 'measured' | 'changed' {
  return body.type === 'assistant/message' || body.type === 'assistant/attempt'
    ? 'measured'
    : 'changed';
}
