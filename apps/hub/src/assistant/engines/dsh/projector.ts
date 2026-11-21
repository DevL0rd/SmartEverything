import { SettledLanes, markWorking } from './projector-lanes';
import { helperParentMessageId } from '../../delegation/helper-delivery';
import { Logger, background, messageOf } from '@smarteverything/logging';
import type { ProjectedOp } from '@smarteverything/harness/process';
import { retainInputRefusal } from '../../../harness/input-refusal';
import {
  completeNativeTurn,
  settleSteered,
  type NativeCompletion,
  type ReplayedReply,
} from './projector-completion';
import { TurnStream } from '../../conversation/stream';
import { TurnRetries, finalFailure } from './turn-retry';
import { feedOp, feedTool, followSession } from './turn-feed';
import { DeliveryCorrelation } from './projector-correlation';
import { NativeSessionActivity } from './session-activity';
import type { ActiveTurn, ProjectorOptions } from './projector-types';
import {
  ApiError,
  chatTodosOf,
  type AiChatRow,
  type AiHarnessEvent,
} from '@smarteverything/domain';
import type { HarnessService } from '../../../harness/service';
import type { ConversationLog } from '../../conversation-log';
import type { StoredEvent } from '../../../store/repositories/assistant-events';
const log = new Logger('hub.assistant-engine');
export type { ActiveTurn, ProjectorOptions };
export class ConversationProjector {
  readonly active = new Map<string, ActiveTurn>();
  private readonly correlation: DeliveryCorrelation;
  private readonly admitted = new Set<string>();
  private readonly held = new Set<string>();
  private readonly completing = new Set<string>();
  private readonly completions = new Map<string, Promise<void>>();
  private readonly lanes = new SettledLanes();
  private readonly retries: TurnRetries<ActiveTurn>;
  readonly sessions: NativeSessionActivity;
  constructor(
    readonly options: ProjectorOptions,
    private readonly authorize: (event: StoredEvent, chat: AiChatRow, id: string) => Promise<void>,
    private readonly toolFinished: (turn: ActiveTurn) => Promise<void>,
    resume: (turn: ActiveTurn, deliveryId: string, text: string) => Promise<void>,
  ) {
    this.correlation = new DeliveryCorrelation(options.service, this.active);
    this.sessions = new NativeSessionActivity(options.service, options.emit, (chatId) =>
      this.hasChat(chatId),
    );
    this.retries = new TurnRetries({
      resume: (turn, deliveryId, text): Promise<void> => {
        this.continueAs(turn, deliveryId);
        return resume(turn, deliveryId, text);
      },
      active: (turn): boolean => this.active.get(turn.event.id) === turn,
      final: (turn, message): void => {
        this.complete(turn, {
          kind: 'failed',
          failure: { code: 'route_unavailable', message, retry_at: null },
        });
      },
    });
  }

  async stopRetrying(chatId: string): Promise<boolean> {
    const stopped = [...this.active.values()].filter(
      (turn) => turn.chat.id === chatId && this.retries.cancel(turn),
    );
    for (const turn of stopped) this.complete(turn, { kind: 'completed', interrupted: true });
    await Promise.allSettled(stopped.flatMap((turn) => this.completions.get(turn.event.id) ?? []));
    return stopped.length > 0;
  }
  hold(turn: ActiveTurn): void {
    this.held.add(turn.event.id);
  }
  release(turn: ActiveTurn): void {
    this.held.delete(turn.event.id);
  }
  continueAs(turn: ActiveTurn, deliveryId: string): void {
    this.correlation.continueAs(turn, deliveryId);
    this.release(turn);
  }
  ofChat(id: string): ActiveTurn | undefined {
    return [...this.active.values()].find((turn) => turn.chat.id === id && !turn.restored);
  }
  private get service(): HarnessService {
    return this.options.service;
  }
  private get conversation(): ConversationLog {
    return this.options.conversation;
  }
  hasChat(id: string, freshOnly = false): boolean {
    return [...this.active.values()].some(
      (turn) => turn.chat.id === id && (!freshOnly || !turn.restored),
    );
  }
  received = (event: AiHarnessEvent): Promise<void> =>
    this.lanes.run(event.chat_id, () => this.receivedEvent(event));
  start(event: StoredEvent, chat: AiChatRow, replyId: string, restored = false): Promise<void> {
    const stream = new TurnStream(
      {
        chatId: chat.id,
        turnId: event.id,
        messageId: replyId,
        profileId: event.profile_id,
      },
      this.options.emit,
    );
    this.sessions.yielded(chat.id);
    let finish = (): void => undefined;
    const completed = new Promise<void>((done) => {
      finish = done;
    });
    const turn: ActiveTurn = {
      event,
      chat,
      replyId,
      stream,
      done: finish,
      restored,
      steered: [],
    };
    this.active.set(event.id, turn);
    log.debug('dsh.stream_opened', {
      eventId: event.id,
      chatId: chat.id,
      replyId,
      restored,
      activeTurns: this.active.size,
    });
    stream.bindTimeline(
      (timeline): void => {
        background(
          turn.restored && stream.spoken === ''
            ? this.conversation.timeline(turn.replyId, timeline)
            : this.conversation.progress(turn.replyId, stream.spoken, timeline),
          'dsh.reply_progress_failed',
          { eventId: event.id, chatId: chat.id },
        );
      },
      (listener) => this.conversation.onMessage(chat.id, listener),
    );
    stream.snapshot('thinking', null, null);
    return completed;
  }
  private async receivedEvent(event: AiHarnessEvent): Promise<void> {
    const turn = this.correlation.turnOf(event);
    if (turn === undefined) {
      await this.sessions.received(event);
      log.trace('dsh.event_uncorrelated', {
        kind: event.kind,
        chatId: event.chat_id,
        hasDelivery: event.delivery_id !== undefined,
      });
      return;
    }
    if (this.swallowed(turn, event)) {
      log.debug('dsh.event_held', {
        kind: event.kind,
        eventId: turn.event.id,
        chatId: turn.chat.id,
      });
      return;
    }
    if (event.kind === 'state' && event.delivery_id !== undefined)
      await this.admitClaim(turn, event);
    if (
      event.delivery_id === undefined &&
      ['text', 'reasoning', 'tool'].includes(event.kind) &&
      !this.admitted.has(turn.event.id)
    ) {
      this.admitted.add(turn.event.id);
      await markWorking(this.service.store, this.conversation, turn.event);
    }
    await this.activeEvent(turn, event);
  }
  private swallowed(turn: ActiveTurn, event: AiHarnessEvent): boolean {
    return this.held.has(turn.event.id) && (event.kind === 'completed' || event.kind === 'failed');
  }
  private async admitClaim(
    turn: ActiveTurn,
    event: Extract<AiHarnessEvent, { kind: 'state' }>,
  ): Promise<void> {
    try {
      await this.authorize(turn.event, turn.chat, event.session_id);
      await this.service.store.host.call(
        'harnessRecovery',
        'claimTurn',
        event.session_id,
        event.native_turn,
        turn.event.id,
      );
      if (!this.admitted.has(turn.event.id)) {
        await markWorking(this.service.store, this.conversation, turn.event);
        log.debug('dsh.claim_admitted', {
          eventId: turn.event.id,
          chatId: turn.chat.id,
          nativeTurn: event.native_turn,
        });
      }
      this.admitted.add(turn.event.id);
    } catch (cause) {
      log.warn('dsh.claim_refused', {
        eventId: turn.event.id,
        chatId: turn.chat.id,
        cause: cause instanceof Error ? cause.name : typeof cause,
        reason: messageOf(cause),
      });
      if (
        helperParentMessageId(turn.event) === null &&
        (this.admitted.has(turn.event.id) ||
          !(cause instanceof ApiError) ||
          cause.code !== 'forbidden')
      )
        throw cause;
      const refusal = new ApiError('command_refused', messageOf(cause));
      background(retainInputRefusal(this.service.store, event, refusal), 'dsh.refusal_failed');
      this.complete(
        turn,
        {
          kind: 'failed',
          failure: { code: 'operation_failed', message: refusal.message, retry_at: null },
        },
        true,
      );
      throw refusal;
    }
  }
  private async activeEvent(turn: ActiveTurn, event: AiHarnessEvent): Promise<void> {
    switch (event.kind) {
      case 'text':
        turn.stream.text(event.delta);
        return;
      case 'reasoning':
        turn.stream.reasoning(event.delta);
        return;
      case 'tool':
        await this.tool(turn, event);
        return;
      case 'usage':
        return;
      case 'completed':
      case 'failed':
        this.completedEvent(turn, event);
        return;
      case 'state':
        this.stateEvent(turn, event);
        return;
      case 'agent':
      case 'interaction':
        return;
    }
  }
  private stateEvent(turn: ActiveTurn, event: Extract<AiHarnessEvent, { kind: 'state' }>): void {
    if (event.assistant_attempt !== undefined)
      turn.stream.assistantAttempt(event.assistant_attempt);
    if (event.session.reconnecting === true)
      log.info('dsh.turn_reconnecting', { eventId: turn.event.id, chatId: turn.chat.id });
    followSession(turn.stream, event.session);
  }
  private completedEvent(
    turn: ActiveTurn,
    event: Extract<AiHarnessEvent, { kind: 'completed' | 'failed' }>,
  ): void {
    log.info('dsh.turn_event_ended', {
      eventId: turn.event.id,
      chatId: turn.chat.id,
      outcome: event.kind,
      steered: turn.steered.length,
      spokenLength: turn.stream.spoken.length,
    });
    background(
      this.service.store.host.call(
        'harnessDeliveries',
        'cut',
        turn.event.id,
        0,
        event.kind === 'completed' ? event.durable_seq : null,
      ),
      'dsh.delivery_cut_failed',
      { eventId: turn.event.id },
    );
    this.complete(turn, event);
  }
  private async tool(
    turn: ActiveTurn,
    event: Extract<AiHarnessEvent, { kind: 'tool' }>,
  ): Promise<void> {
    log.debug('dsh.tool_event', {
      eventId: turn.event.id,
      chatId: turn.chat.id,
      tool: event.name,
      callId: event.call_id,
      state: event.state,
    });
    this.toolEvent(turn, event);
    this.recordTodos(turn, chatTodosOf(event.name, event.input));
    if (event.state !== 'running') await this.toolFinished(turn);
  }
  private recordTodos(turn: ActiveTurn, todos: ReturnType<typeof chatTodosOf>): void {
    if (todos === null) return;
    background(this.conversation.todos(turn.replyId, todos), 'dsh.reply_todos_failed', {
      eventId: turn.event.id,
    });
  }
  private toolEvent(turn: ActiveTurn, event: Extract<AiHarnessEvent, { kind: 'tool' }>): void {
    feedTool(turn.stream, {
      callId: event.call_id,
      name: event.name,
      state: event.state,
      detail: event.detail,
      ...(event.input === undefined ? {} : { input: event.input }),
      ...(event.output === undefined ? {} : { output: event.output }),
    });
  }
  replay(
    turn: ActiveTurn,
    ops: readonly ProjectedOp[],
    event: NativeCompletion,
    reply: ReplayedReply,
  ): void {
    for (const op of ops) {
      feedOp(turn.stream, op);
      if (op.op !== 'tool') continue;
      this.recordTodos(turn, chatTodosOf(op.tool.name, op.tool.input));
    }
    if (reply.timeline !== undefined) turn.stream.replayBoundaries(reply.timeline);
    this.complete(turn, event, false, reply);
  }
  complete(
    turn: ActiveTurn,
    event: NativeCompletion,
    admissionRefused = false,
    replayed?: ReplayedReply,
  ): void {
    if (
      event.kind === 'failed' &&
      !admissionRefused &&
      replayed === undefined &&
      helperParentMessageId(turn.event) === null
    ) {
      if (!finalFailure(event.failure)) {
        this.retries.failed(turn, event.failure);
        return;
      }
      log.warn('dsh.turn_failed_final', {
        eventId: turn.event.id,
        chatId: turn.chat.id,
        failureCode: event.failure.code,
        reason: event.failure.message,
      });
    }
    if (this.completing.has(turn.event.id)) {
      log.debug('dsh.turn_already_completing', { eventId: turn.event.id, chatId: turn.chat.id });
      return;
    }
    this.completing.add(turn.event.id);
    const completion = this.completion(turn, event, admissionRefused, replayed).finally(() => {
      this.completions.delete(turn.event.id);
    });
    this.completions.set(turn.event.id, completion);
    background(completion, 'dsh.turn_complete_failed', {
      eventId: turn.event.id,
      chatId: turn.chat.id,
    });
  }
  async settled(): Promise<void> {
    while (this.lanes.busy() || this.completions.size > 0)
      await Promise.allSettled([...this.lanes.pending(), ...this.completions.values()]);
    await this.conversation.settled();
  }
  private completion(
    turn: ActiveTurn,
    event: NativeCompletion,
    admissionRefused: boolean,
    replayed: ReplayedReply | undefined,
  ): Promise<void> {
    return completeNativeTurn({
      service: this.service,
      conversation: this.conversation,
      turn,
      event,
      admissionRefused,
      ...(replayed === undefined ? {} : { replay: replayed }),
      finished: this.options.finished,
      retire: (): void => {
        this.completing.delete(turn.event.id);
        this.retries.forget(turn);
        this.active.delete(turn.event.id);
        this.correlation.retire(turn);
        this.admitted.delete(turn.event.id);
        this.held.delete(turn.event.id);
        settleSteered(this.conversation, this.options.finished, turn, event);
        this.sessions.resync(turn.chat.id);
        turn.done();
      },
    });
  }
}
