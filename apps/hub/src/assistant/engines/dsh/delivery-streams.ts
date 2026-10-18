import { toolSummary } from '@smarteverything/harness/process';
import { Logger, messageOf } from '@smarteverything/logging';
import { savedWebSources } from '../../web-search-supplier';
import { retainInputRefusal } from '../../../harness/input-refusal';
import {
  completeNativeTurn,
  completionFailure,
  type NativeCompletion,
  type NativeCompletionTurn,
} from './completion';
import { TurnStream, type StreamEmit } from '../../conversation/stream';
import {
  ApiError,
  CHAT_RECONNECTING_REASON,
  type AiChatRow,
  type AiHarnessEvent,
  type ChatActivityNotice,
} from '@smarteverything/domain';
import type { HarnessService } from '../../../harness/service';
import type { ConversationLog } from '../../conversation-log';
import type { StoredEvent } from '../../../store/repositories/assistant-events';
const log = new Logger('hub.assistant-engine');
function retrying(notice: ChatActivityNotice): boolean {
  return notice.state === 'thinking' && notice.reason !== null;
}

export interface ActiveTurn extends NativeCompletionTurn {
  readonly done: () => void;
  readonly restored: boolean;
  readonly steered: StoredEvent[];
  replyId: string;
  after: string | null;
}
export interface DeliveryStreamOptions {
  readonly service: HarnessService;
  readonly conversation: ConversationLog;
  readonly emit: StreamEmit;
  readonly finished: (event: StoredEvent, text: string, ok: boolean) => void;
}
export class NativeDeliveryStreams {
  readonly active = new Map<string, ActiveTurn>();
  private readonly claimed = new Map<string, number>();
  private readonly admitted = new Set<string>();
  private readonly aliases = new Map<string, string>();
  private readonly held = new Set<string>();
  constructor(
    private readonly options: DeliveryStreamOptions,
    private readonly authorize: (event: StoredEvent, chat: AiChatRow, id: string) => void,
    private readonly toolFinished: (turn: ActiveTurn) => void,
  ) {}
  hold(turn: ActiveTurn): void {
    this.held.add(turn.event.id);
  }
  release(turn: ActiveTurn): void {
    this.held.delete(turn.event.id);
  }
  continueAs(turn: ActiveTurn, deliveryId: string): void {
    this.aliases.set(deliveryId, turn.event.id);
    this.claimed.delete(turn.event.id);
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
  received = (event: AiHarnessEvent): void => {
    this.receivedEvent(event);
  };
  private correlated(event: AiHarnessEvent): ActiveTurn | undefined {
    if (event.delivery_id !== undefined) {
      const turn = this.active.get(this.aliases.get(event.delivery_id) ?? event.delivery_id);
      if (turn !== undefined) {
        this.requireConversation(turn, event);
        this.requireClaimedTurn(turn, event);
      }
      return turn;
    }
    return this.legacyTurn(event);
  }
  private requireConversation(turn: ActiveTurn, event: AiHarnessEvent): void {
    if (
      turn.chat.id !== event.chat_id ||
      this.service.binding(turn.chat).session_id !== event.session_id
    )
      throw new ApiError(
        'forbidden',
        'Native input correlation belongs to another shared conversation.',
      );
  }
  private legacyTurn(event: AiHarnessEvent): ActiveTurn | undefined {
    const turns = [...this.active.values()].filter((turn) => turn.chat.id === event.chat_id);
    if (turns.length > 1 && !['state', 'agent', 'interaction'].includes(event.kind))
      throw new ApiError(
        'conflict',
        'This host cannot correlate restored native input with its original delivery.',
      );
    const turn = turns.length === 1 ? turns[0] : undefined;
    if (turn === undefined || turn.restored) return undefined;
    const target = this.service.binding(turn.chat).execution_target;
    return this.service.directory.get(target).host.manifest?.delivery_correlation === true
      ? undefined
      : turn;
  }
  private requireClaimedTurn(turn: ActiveTurn, event: AiHarnessEvent): void {
    if (event.kind === 'completed' && event.input_discarded === true) {
      if (this.claimed.has(turn.event.id))
        throw new ApiError(
          'conflict',
          'A claimed native delivery cannot finish as discarded input.',
        );
      return;
    }
    if (event.native_turn === undefined)
      throw new ApiError('conflict', 'Correlated native input is missing its claimed turn.');
    const prior = this.claimed.get(turn.event.id);
    if (prior !== undefined && prior !== event.native_turn)
      throw new ApiError('conflict', 'Native delivery was already claimed by another turn.');
    if (event.kind === 'state') this.claimed.set(turn.event.id, event.native_turn);
    else if (prior !== event.native_turn)
      throw new ApiError('conflict', 'Native publication differs from its claimed delivery turn.');
  }
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
      after: null,
    };
    this.active.set(event.id, turn);
    log.debug('dsh.stream_opened', {
      eventId: event.id,
      chatId: chat.id,
      replyId,
      restored,
      activeTurns: this.active.size,
    });
    stream.bindTimeline((timeline): void => {
      this.conversation.progress(turn.replyId, stream.spoken, timeline);
    });
    stream.snapshot('thinking', null, null);
    return completed;
  }
  private receivedEvent(event: AiHarnessEvent): void {
    const turn = this.correlated(event);
    if (turn === undefined) {
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
    this.placeSteered(turn, event);
    if (event.kind === 'state' && event.delivery_id !== undefined) this.admitClaim(turn, event);
    if (
      event.delivery_id === undefined &&
      ['text', 'reasoning', 'tool'].includes(event.kind) &&
      !this.admitted.has(turn.event.id)
    ) {
      this.working(turn);
      this.admitted.add(turn.event.id);
    }
    this.activeEvent(turn, event);
  }
  private placeSteered(turn: ActiveTurn, event: AiHarnessEvent): void {
    if (
      turn.after === null ||
      !['text', 'reasoning', 'tool'].includes(event.kind) ||
      !turn.stream.quiet
    )
      return;
    const model = this.service.binding(turn.chat).model;
    const reply = this.conversation.startReply(turn.chat, turn.after, model);
    const text = turn.stream.spoken;
    turn.stream.endSegment();
    this.conversation.finishReply(turn.replyId, text, {
      model,
      steps: turn.stream.settled(),
      sources: savedWebSources(this.service, turn.replyId),
    });
    Object.assign(turn, { replyId: reply.id, after: null });
    turn.stream.beginSegment(reply.id);
  }
  private swallowed(turn: ActiveTurn, event: AiHarnessEvent): boolean {
    return this.held.has(turn.event.id) && (event.kind === 'completed' || event.kind === 'failed');
  }
  private admitClaim(turn: ActiveTurn, event: Extract<AiHarnessEvent, { kind: 'state' }>): void {
    try {
      this.authorize(turn.event, turn.chat, event.session_id);
      if (!this.admitted.has(turn.event.id)) {
        this.working(turn);
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
        this.admitted.has(turn.event.id) ||
        !(cause instanceof ApiError) ||
        cause.code !== 'forbidden'
      )
        throw cause;
      const refusal = new ApiError('command_refused', cause.message);
      retainInputRefusal(this.service.store, event, refusal, () => {
        this.complete(
          turn,
          {
            kind: 'failed',
            failure: { code: 'operation_failed', message: cause.message, retry_at: null },
          },
          true,
        );
      });
      throw refusal;
    }
  }
  private activeEvent(turn: ActiveTurn, event: AiHarnessEvent): void {
    switch (event.kind) {
      case 'text':
        turn.stream.text(event.delta);
        return;
      case 'reasoning':
        turn.stream.reasoning(event.delta);
        return;
      case 'tool':
        this.tool(turn, event);
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
    if (event.session.reconnecting === true) {
      log.info('dsh.turn_reconnecting', { eventId: turn.event.id, chatId: turn.chat.id });
      turn.stream.snapshot('thinking', null, CHAT_RECONNECTING_REASON);
    } else if (retrying(turn.stream.current())) turn.stream.snapshot('thinking', null, null);
  }
  private working(turn: ActiveTurn): void {
    const messageId = turn.event.message_id;
    if (messageId === null) return;
    const current = this.service.store.assistantEvents.ofMessage(messageId);
    if (current?.id !== turn.event.id) return;
    const message = this.service.store.assistantChat.message(messageId);
    if (message.state !== 'queued' && message.state !== 'delivered') return;
    this.conversation.stateOf(messageId, 'working');
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
    this.service.store.harnessDeliveries.cut(
      turn.event.id,
      this.service.store.harnessDeliveries.find(turn.event.id)?.start_seq ?? 0,
      event.kind === 'completed' ? event.durable_seq : null,
    );
    this.complete(turn, event);
  }
  private tool(turn: ActiveTurn, event: Extract<AiHarnessEvent, { kind: 'tool' }>): void {
    log.debug('dsh.tool_event', {
      eventId: turn.event.id,
      chatId: turn.chat.id,
      tool: event.name,
      callId: event.call_id,
      state: event.state,
    });
    this.toolEvent(turn, event);
    if (event.state !== 'running') this.toolFinished(turn);
  }
  private toolEvent(turn: ActiveTurn, event: Extract<AiHarnessEvent, { kind: 'tool' }>): void {
    turn.stream.tool(
      {
        callId: event.call_id,
        name: event.name,
        title: event.name,
        state:
          event.state === 'completed' ? 'done' : event.state === 'unknown' ? 'failed' : event.state,
        detail: toolSummary(event.detail, 400),
      },
      {
        input: event.input,
        output: event.output,
        ...(event.state === 'unknown' ? { state: 'unknown' as const } : {}),
      },
    );
  }
  complete(turn: ActiveTurn, event: NativeCompletion, admissionRefused = false): void {
    completeNativeTurn({
      service: this.service,
      conversation: this.conversation,
      turn,
      event,
      admissionRefused,
      finished: this.options.finished,
      retire: (): void => {
        this.active.delete(turn.event.id);
        this.claimed.delete(turn.event.id);
        this.admitted.delete(turn.event.id);
        this.held.delete(turn.event.id);
        for (const [alias, id] of this.aliases)
          if (id === turn.event.id) this.aliases.delete(alias);
        this.settleSteered(turn, event);
        turn.done();
      },
    });
  }
  private settleSteered(turn: ActiveTurn, event: NativeCompletion): void {
    const ok = event.kind === 'completed' && !event.interrupted;
    const failure = completionFailure(event, false);
    for (const steered of turn.steered) {
      if (ok) this.conversation.stateOf(steered.message_id, 'answered');
      else this.conversation.failedMessage(steered.message_id, failure.reason, failure.code);
      this.options.finished(steered, turn.stream.spoken, ok);
    }
  }
}
