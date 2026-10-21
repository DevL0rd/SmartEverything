import { deliveryReferences } from '../../../harness/reference-delivery';
import { effectiveClientById } from '../../../server/person-access';
import { ensureNativeControlSession } from './session-control';
import { rewriteNativeHistory } from '../../../harness/history-mutation';
import { OwnEngineSelections } from '../../../harness/own-selection';
import { NativeDeliveryStreams, type ActiveTurn } from './delivery-streams';
import { TurnMachineMoves } from './machine-moves';
import { midWorkMessage } from '../../conversation/prompt';
import { followDisconnectedTurns, nativeEngineStatus } from './host-lifecycle';
import { sessionAttached } from '../../../harness/attach';
import { closeNativeHistory } from './history-change';
import { bindNativeChild } from './children';
import { nativeReplyId, reconcileNativeReplies } from './reconciliation';
import {
  eventAuthority,
  admitExecutionTarget,
  executionRole,
  withExecutionAuthority,
} from '../../turn-authority';
import { openConversation } from '../../../harness/opening';
import { randomUUID } from 'node:crypto';
import {
  DshTrace,
  controlFailed,
  controlFinished,
  controlRefused,
  controlSent,
  steerSkipped,
  steered,
} from './runner-trace';
import { ApiError } from '@smarteverything/domain';
import type { AiChatRow, HarnessRuntimeReceipt } from '@smarteverything/domain';
import type { StoredEvent } from '../../../store/repositories/assistant-events';
import type { ConversationLog } from '../../conversation-log';
import type { Engine } from '../engine';
import type { HarnessService } from '../../../harness/service';
import type { HarnessDispatcher } from '@smarteverything/harness/process';
import type { StreamEmit } from '../../conversation/stream';
import { background, messageOf } from '@smarteverything/logging';

export class DshRunner {
  private readonly turns: NativeDeliveryStreams;
  private readonly moves: TurnMachineMoves<ActiveTurn>;
  constructor(
    private readonly options: {
      readonly service: HarnessService;
      readonly dispatcher: { readonly runtime: Pick<HarnessDispatcher['runtime'], 'pendingInput'> };
      readonly conversation: ConversationLog;
      readonly emit: StreamEmit;
      readonly finished: (event: StoredEvent, text: string, ok: boolean) => void;
    },
  ) {
    reconcileNativeReplies(options.service.store, options.conversation, options.finished, (input) =>
      options.dispatcher.runtime.pendingInput(input),
    );
    this.turns = new NativeDeliveryStreams(
      options,
      this.authorizeEvent.bind(this),
      (turn) => {
        this.moves.atToolCall(turn);
      },
      (turn, deliveryId, text) => this.resume(turn, deliveryId, text),
    );
    this.moves = new TurnMachineMoves(options.service, this.turns);
    for (const delivery of options.service.store.harnessDeliveries.pending()) {
      const event = options.service.store.assistantEvents.event(delivery.delivery_id);
      background(
        this.turns.start(
          event,
          options.service.store.aiChats.chat(event.chat_id),
          nativeReplyId(delivery),
          true,
        ),
        'turns.start_failed',
      );
    }
    options.service.onEvent(this.turns.received);
    followDisconnectedTurns(
      options.service,
      () => this.turns.active.values(),
      (turn) => {
        this.turns.complete(turn, {
          kind: 'failed',
          failure: {
            code: 'source_outcome_unknown',
            message:
              'Computer execution host disconnected; admitted effects may be unknown and were not replayed.',
            retry_at: null,
          },
        });
      },
    );
  }
  private get service(): HarnessService {
    return this.options.service;
  }
  private get conversation(): ConversationLog {
    return this.options.conversation;
  }
  engine(): Engine {
    return {
      kind: 'dsh',
      activity: (profileId) =>
        [...this.turns.active.values()]
          .filter((turn) => turn.event.profile_id === profileId)
          .map((turn) => turn.stream.current()),
      ownerOnly: false,
      status: (chat) => nativeEngineStatus(this.service, chat, this.turns.hasChat(chat.id)),
      deliver: (event, chat) => this.deliver(event, chat),
      steer: (event, chat) => this.steer(event, chat),
      interrupt: async (chat): Promise<void> => {
        if (!this.turns.stopRetrying(chat.id)) await this.control(chat, 'interrupt');
      },
      compact: async (chat): Promise<boolean> => {
        const receipt = await this.control(chat, 'compact');
        if (receipt.compacted === undefined)
          throw new ApiError('conflict', 'Native compaction returned no confirmed outcome.');
        return receipt.compacted;
      },
      historyChanged: (chat, owner): Promise<void> => {
        if (chat.engine.kind !== 'dsh') return Promise.resolve();
        this.turns.stopRetrying(chat.id);
        return closeNativeHistory(this.service, chat, owner, this.turns.hasChat(chat.id));
      },
      historyRemoved: (chat, rows): void => {
        rewriteNativeHistory(this.service, chat, rows);
      },
    };
  }
  private deliver(event: StoredEvent, original: AiChatRow): Promise<void> {
    const authority = eventAuthority(this.service.store, event);
    return withExecutionAuthority(authority, () => this.deliverAdmitted(event, original));
  }
  private async deliverAdmitted(event: StoredEvent, original: AiChatRow): Promise<void> {
    new OwnEngineSelections(this.service).migrate(original.id);
    const admitted = this.service.store.aiChats.chat(original.id);
    this.admitRestoredInput(admitted);
    const existing = this.service.store.harnessDeliveries.find(event.id);
    const trace = new DshTrace(event, original.id);
    if (existing !== undefined) {
      trace.replayed(existing.state);
      return;
    }
    const sessionId = await this.session(event, admitted);
    trace.sessionReady(sessionId);
    this.authorizeEvent(event, admitted, sessionId);
    const chat = this.service.store.aiChats.chat(original.id);
    const delivery = this.service.store.harnessDeliveries.admit(
      event.id,
      sessionId,
      () =>
        this.conversation.startReply(chat, event.message_id, this.service.binding(chat).model).id,
    );
    const completed = this.turns.start(event, chat, nativeReplyId(delivery));
    try {
      bindNativeChild(this.service.store, event, chat, sessionId);
      trace.turnStarted(sessionId, this.service.binding(chat).model, nativeReplyId(delivery));
      await this.prompt(event, chat);
      trace.promptSent();
    } catch (cause) {
      trace.promptFailed(cause, sessionId);
      this.failAdmitted(event, cause);
      return;
    }
    await completed;
    trace.turnFinished(sessionId);
    await this.moves.atTurnEnd(chat.id);
  }
  private resume(turn: ActiveTurn, deliveryId: string, text: string): Promise<void> {
    const authority = eventAuthority(this.service.store, turn.event);
    return withExecutionAuthority(authority, async () => {
      const chat = this.service.store.aiChats.chat(turn.chat.id);
      this.authorizeEvent(turn.event, chat, await this.session(turn.event, chat));
      const state = this.service.state(
        { profileId: turn.event.profile_id, role: executionRole(authority) },
        chat.id,
      );
      if (state.epoch === null)
        throw new ApiError('conflict', 'Native writer authority is unavailable.');
      await this.service.directory.execute(state.target, randomUUID(), {
        kind: 'prompt',
        session_id: state.session_id,
        expected_epoch: state.epoch,
        delivery_id: deliveryId,
        text,
        attachments: [],
      });
    });
  }
  private failAdmitted(event: StoredEvent, cause: unknown): void {
    const active = this.turns.active.get(event.id);
    if (active === undefined) return;
    this.turns.complete(active, {
      kind: 'failed',
      failure: {
        code: 'source_outcome_unknown',
        message: messageOf(cause).slice(0, 2000),
        retry_at: null,
      },
    });
  }
  private steerable(event: StoredEvent, chat: AiChatRow): boolean {
    if (event.message_id === null || chat.kind !== 'chat') return false;
    const message = this.service.store.assistantChat.message(event.message_id);
    return message.attachments.length === 0 && (message.references?.length ?? 0) === 0;
  }
  private async steer(event: StoredEvent, chat: AiChatRow): Promise<boolean> {
    const turn = this.turns.ofChat(chat.id);
    if (turn === undefined || this.moves.moves(chat.id) || !this.steerable(event, chat)) {
      steerSkipped(event, chat.id, {
        activeTurn: turn !== undefined,
        moving: this.moves.moves(chat.id),
        steerable: turn !== undefined && this.steerable(event, chat),
      });
      return false;
    }
    const state = this.service.state({ profileId: chat.profile_id, role: 'member' }, chat.id);
    if (state.epoch === null) {
      steerSkipped(event, chat.id, { reason: 'no_epoch' });
      return false;
    }
    await this.service.directory.execute(state.target, randomUUID(), {
      kind: 'steer',
      session_id: state.session_id,
      expected_epoch: state.epoch,
      text: midWorkMessage(event.text),
    });
    steered(event, chat.id, state.session_id, state.epoch);
    turn.steered.push(event);
    turn.after = event.message_id;
    this.conversation.stateOf(event.message_id, 'delivered');
    return true;
  }
  private admitRestoredInput(chat: AiChatRow): void {
    const binding = this.service.binding(chat);
    const pending = this.service.store.harnessDeliveries
      .pending(binding.session_id ?? undefined)
      .filter(
        (delivery) =>
          this.service.store.assistantEvents.event(delivery.delivery_id).chat_id === chat.id,
      );
    if (pending.length === 0) return;
    const connection = this.service.directory.get(binding.execution_target);
    if (connection.host.manifest?.delivery_correlation !== true)
      throw new ApiError(
        'conflict',
        'This execution host must support native delivery correlation before restoring pending conversation input.',
      );
    for (const delivery of pending) {
      const event = this.service.store.assistantEvents.event(delivery.delivery_id);
      const authority = withExecutionAuthority(undefined, () =>
        eventAuthority(this.service.store, event),
      );
      admitExecutionTarget(this.service.store, chat, authority);
    }
  }
  private authorizeEvent(event: StoredEvent, chat: AiChatRow, id: string): void {
    const authority = eventAuthority(this.service.store, event);
    admitExecutionTarget(this.service.store, chat, authority);
    this.service.own({ profileId: event.profile_id, role: 'member' }, chat.id);
    if (this.service.store.dshSessions.stat(id, event.profile_id)?.chat_id !== chat.id)
      throw new ApiError('forbidden', 'Delivery cannot reuse another conversation native session.');
    const client =
      authority.client_id === null
        ? undefined
        : effectiveClientById(this.service.store, authority.client_id);
    if (
      client !== undefined &&
      this.service.store.profiles.activeOf(client.id).id !== event.profile_id
    )
      throw new ApiError(
        'forbidden',
        'The initiating app changed its active profile before native delivery.',
      );
    const role = executionRole(authority);
    const grant = this.service.storage.grant(id);
    this.service.store.harnessCoordination.issue({
      ...grant,
      event_id: event.id,
      role,
      client_id: authority.client_id,
      authority:
        authority.kind === 'client'
          ? { kind: 'manual', profileId: event.profile_id }
          : { kind: 'trigger', profileId: event.profile_id, grantId: event.id },
    });
  }
  private async session(event: StoredEvent, original: AiChatRow): Promise<string> {
    const binding = this.service.binding(original);
    const authority = eventAuthority(this.service.store, event);
    let sessionId = binding.session_id;
    if (!sessionAttached(this.service, sessionId, event.profile_id)) {
      const open = await openConversation(this.service, {
        owner: { profileId: event.profile_id, role: executionRole(authority) },
        chatId: original.id,
        authority:
          authority.kind === 'service'
            ? { kind: 'trigger', profileId: event.profile_id, grantId: event.id }
            : { kind: 'manual', profileId: event.profile_id },
        ...(authority.client_id === null ? {} : { clientId: authority.client_id }),
      });
      sessionId = open.claim.session_id;
    }
    if (sessionId === null)
      throw new ApiError('conflict', 'Native session admission did not establish an identity.');
    return sessionId;
  }
  private async prompt(event: StoredEvent, chat: AiChatRow): Promise<void> {
    const authority = eventAuthority(this.service.store, event);
    const state = this.service.state(
      { profileId: event.profile_id, role: executionRole(authority) },
      chat.id,
    );
    if (state.epoch === null)
      throw new ApiError('conflict', 'Native writer authority is unavailable.');
    this.service.store.harnessCoordination.sender(state.session_id, authority.client_id);
    const references = deliveryReferences(this.service, event);
    this.service.store.harnessDeliveries.cut(event.id, state.metadata.next_seq);
    await this.service.directory.execute(state.target, event.id, {
      kind: 'prompt',
      session_id: state.session_id,
      expected_epoch: state.epoch,
      delivery_id: event.id,
      text: event.text,
      ...(references.length === 0 ? {} : { references: [...references] }),
      attachments:
        event.message_id === null
          ? []
          : this.service.store.assistantChat.attachmentsOf(event.message_id).map((file) => file.id),
    });
  }
  private async control(
    chat: AiChatRow,
    kind: 'interrupt' | 'compact' | 'close',
  ): Promise<HarnessRuntimeReceipt> {
    const startedAt = performance.now();
    const admitted = await ensureNativeControlSession(this.service, chat);
    const state = this.service.state(
      { profileId: admitted.profile_id, role: 'member' },
      admitted.id,
    );
    if (state.epoch === null) {
      controlRefused(chat.id, kind);
      throw new ApiError('conflict', 'Native writer authority is unavailable.');
    }
    controlSent(chat.id, kind, state.session_id, state.epoch);
    try {
      const receipt = await this.service.directory.execute(state.target, randomUUID(), {
        kind,
        session_id: state.session_id,
        expected_epoch: state.epoch,
      });
      controlFinished(chat.id, kind, startedAt);
      return receipt;
    } catch (cause) {
      controlFailed(chat.id, kind, cause, startedAt);
      throw cause;
    }
  }
}
