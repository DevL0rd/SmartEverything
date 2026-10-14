import { toolSummary } from '@smarteverything/harness/process';
import { retainInputRefusal } from '../../../harness/input-refusal';
import { completeNativeTurn, type NativeCompletion, type NativeCompletionTurn } from './completion';
import { TurnStream, type StreamEmit } from '../../conversation/stream';
import { ApiError, type AiChatRow, type AiHarnessEvent } from '@smarteverything/domain';
import type { HarnessService } from '../../../harness/service';
import type { ConversationLog } from '../../conversation-log';
import type { StoredEvent } from '../../../store/repositories/assistant-events';
interface ActiveTurn extends NativeCompletionTurn {
  readonly done: () => void;
  readonly restored: boolean;
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
  constructor(
    private readonly options: DeliveryStreamOptions,
    private readonly authorize: (event: StoredEvent, chat: AiChatRow, id: string) => void,
  ) {}
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
      const turn = this.active.get(event.delivery_id);
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
    stream.bindTimeline((timeline): void => {
      this.conversation.timeline(replyId, timeline);
    });
    const completed = new Promise<void>((done) => {
      this.active.set(event.id, { event, chat, replyId: replyId, stream, done, restored });
    });
    stream.snapshot('thinking', null, null);
    return completed;
  }
  private receivedEvent(event: AiHarnessEvent): void {
    if (this.service.store.harnessRecovery.consumed(event, 'shared-chat-v1')) return;
    const turn = this.correlated(event);
    if (turn === undefined) return;
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
  private admitClaim(turn: ActiveTurn, event: Extract<AiHarnessEvent, { kind: 'state' }>): void {
    try {
      this.authorize(turn.event, turn.chat, event.session_id);
      if (!this.admitted.has(turn.event.id)) this.working(turn);
      this.admitted.add(turn.event.id);
    } catch (cause) {
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
          () => {
            this.service.store.harnessRecovery.ack(event, 'shared-chat-v1');
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
        this.textEvent(turn, event);
        return;
      case 'reasoning':
        turn.stream.reasoning(event.delta);
        return;
      case 'tool':
        this.tool(turn, event);
        return;
      case 'usage':
        this.usageEvent(event);
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
    if (
      event.assistant_attempt !== undefined &&
      turn.stream.assistantAttempt(event.assistant_attempt)
    )
      this.discardAttempt(turn, event);
    if (event.session.reconnecting === true) turn.stream.snapshot('thinking', null, 'reconnecting');
    else if (turn.stream.current().reason === 'reconnecting')
      turn.stream.snapshot('thinking', null, null);
  }
  private discardAttempt(
    turn: ActiveTurn,
    event: Extract<AiHarnessEvent, { kind: 'state' }>,
  ): void {
    this.service.store.harnessDeliveries.update(
      turn.event.id,
      'admitted',
      turn.stream.content,
      () => {
        this.conversation.flushReply(turn.replyId, turn.stream.content);
        this.service.store.harnessRecovery.ack(event, 'shared-chat-v1');
      },
    );
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
  private usageEvent(event: Extract<AiHarnessEvent, { kind: 'usage' }>): void {
    if (event.context_percent !== null)
      this.service.store.aiChats.noteContext(event.chat_id, Math.round(event.context_percent));
  }
  private completedEvent(
    turn: ActiveTurn,
    event: Extract<AiHarnessEvent, { kind: 'completed' | 'failed' }>,
  ): void {
    this.service.store.harnessDeliveries.cut(
      turn.event.id,
      this.service.store.harnessDeliveries.find(turn.event.id)?.start_seq ?? 0,
      event.kind === 'completed' ? event.durable_seq : null,
    );
    this.complete(turn, event, (): void => {
      this.service.store.harnessRecovery.ack(event, 'shared-chat-v1');
    });
  }
  private textEvent(turn: ActiveTurn, event: Extract<AiHarnessEvent, { kind: 'text' }>): void {
    const delivery = this.service.store.harnessDeliveries.find(turn.event.id);
    if (delivery === undefined)
      throw new ApiError('conflict', 'Text projection lost its admitted delivery.');
    const text = delivery.text + event.delta;
    this.service.store.harnessDeliveries.update(turn.event.id, 'admitted', text, () => {
      this.conversation.flushReply(turn.replyId, text);
      this.service.store.harnessRecovery.ack(event, 'shared-chat-v1');
    });
    turn.stream.text(event.delta);
  }
  private tool(turn: ActiveTurn, event: Extract<AiHarnessEvent, { kind: 'tool' }>): void {
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
  complete(
    turn: ActiveTurn,
    event: NativeCompletion,
    ack?: () => void,
    admissionRefused = false,
  ): void {
    completeNativeTurn({
      service: this.service,
      conversation: this.conversation,
      turn,
      event,
      ack,
      admissionRefused,
      finished: this.options.finished,
      retire: (): void => {
        this.active.delete(turn.event.id);
        this.claimed.delete(turn.event.id);
        this.admitted.delete(turn.event.id);
        turn.done();
      },
    });
  }
}
