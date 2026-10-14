import { deliveryReferences } from '../../../harness/reference-delivery';
import { ensureNativeControlSession } from './session-control';
import { rewriteNativeHistory } from '../../../harness/history-mutation';
import { OwnEngineSelections } from '../../../harness/own-selection';
import { NativeDeliveryStreams } from './delivery-streams';
import { NativeWriterRecovery } from './writer-recovery';
import {
  followDisconnectedTurns,
  nativeSessionReusable,
  nativeEngineStatus,
} from './host-lifecycle';
import { closeNativeHistory } from './history-change';
import { bindNativeChild } from './children';
import { nativeReplyId, reconcileNativeReplies } from './reconciliation';
import {
  eventAuthority,
  admitExecutionTarget,
  executionRole,
  withExecutionAuthority,
  withExecutionAuthorities,
} from '../../execution-authority';
import { openConversation } from '../../../harness/opening';
import type { SideRequest } from '../../side-completion';
import { randomUUID } from 'node:crypto';
import { ApiError } from '@smarteverything/domain';
import type {
  AiChatRow,
  HarnessRuntimeRequest,
  HarnessRuntimeReceipt,
} from '@smarteverything/domain';
import type { StoredEvent } from '../../../store/repositories/assistant-events';
import type { ConversationLog } from '../../conversation-log';
import type { Engine } from '../engine';
import type { HarnessService } from '../../../harness/service';
import type { HarnessDispatcher } from '@smarteverything/harness/process';
import type { StreamEmit } from '../../conversation/stream';

export class DshRunner {
  private readonly turns: NativeDeliveryStreams;
  private readonly recovery: NativeWriterRecovery;
  constructor(
    private readonly options: {
      readonly service: HarnessService;
      readonly dispatcher: HarnessDispatcher;
      readonly conversation: ConversationLog;
      readonly emit: StreamEmit;
      readonly finished: (event: StoredEvent, text: string, ok: boolean) => void;
    },
  ) {
    reconcileNativeReplies(options.service.store, options.conversation, options.finished, (input) =>
      options.dispatcher.runtime.pendingInput(input),
    );
    this.turns = new NativeDeliveryStreams(options, this.authorizeEvent.bind(this));
    this.recovery = new NativeWriterRecovery(options);
    for (const delivery of options.service.store.harnessDeliveries.pending()) {
      const event = options.service.store.assistantEvents.event(delivery.delivery_id);
      void this.turns.start(
        event,
        options.service.store.aiChats.chat(event.chat_id),
        nativeReplyId(delivery),
        true,
      );
    }
    options.service.onEvent(this.turns.received, 'shared-chat-v1');
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
    options.service.replay();
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
        [...this.turns.active.values(), ...this.recovery.active.values()]
          .filter((turn) => turn.event.profile_id === profileId)
          .map((turn) => turn.stream.current()),
      auxiliary: (request) => this.auxiliary(request),
      ownerOnly: false,
      status: (chat) =>
        nativeEngineStatus(
          this.service,
          chat,
          this.turns.hasChat(chat.id) || this.recovery.hasChat(chat.id),
        ),
      deliver: (event, chat) => this.deliver(event, chat),
      interrupt: async (chat): Promise<void> => {
        if (this.recovery.interrupt(chat.id)) return;
        await this.control(chat, 'interrupt');
      },
      compact: async (chat): Promise<boolean> => {
        const receipt = await this.control(chat, 'compact');
        if (receipt.compacted === undefined)
          throw new ApiError('conflict', 'Native compaction returned no confirmed outcome.');
        return receipt.compacted;
      },
      historyChanged: (chat, owner): Promise<void> =>
        chat.engine.kind === 'openrouter'
          ? Promise.resolve()
          : closeNativeHistory(this.service, chat, owner, this.turns.hasChat(chat.id)),
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
    if (this.turns.hasChat(original.id, true) || this.recovery.hasChat(original.id))
      throw new ApiError(
        'conflict',
        'This native conversation already has an admitted turn; use steer to send information while tools run.',
      );
    const admitted = this.admittedChat(event, original);
    this.admitRestoredInput(admitted);
    const existing = this.service.store.harnessDeliveries.find(event.id);
    if (existing !== undefined) {
      if (existing.state === 'completed') return;
      throw new ApiError(
        'conflict',
        'This delivery was already admitted; its disconnected native outcome requires reconciliation, so it was not submitted again.',
      );
    }
    const sessionId = await this.session(event, admitted);
    if (sessionId === null) return;
    this.authorizeEvent(event, admitted, sessionId);
    const chat = this.service.store.aiChats.chat(original.id);
    const delivery = this.service.store.harnessDeliveries.admit(
      event.id,
      sessionId,
      () =>
        this.conversation.startReply(chat, event.message_id, this.service.binding(chat).model).id,
    );
    bindNativeChild(this.service.store, event, chat, sessionId);
    const completed = this.turns.start(event, chat, nativeReplyId(delivery));
    try {
      await this.prompt(event, chat);
    } catch (cause) {
      const active = this.turns.active.get(event.id);
      if (active !== undefined)
        this.turns.complete(active, {
          kind: 'failed',
          failure: {
            code: 'source_outcome_unknown',
            message:
              cause instanceof Error ? cause.message.slice(0, 2000) : 'Native prompt failed.',
            retry_at: null,
          },
        });
      throw cause;
    }
    await completed;
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
      const authority = withExecutionAuthorities([], () =>
        eventAuthority(this.service.store, event),
      );
      admitExecutionTarget(this.service.store, chat, authority);
      this.service.admitTarget(
        { profileId: event.profile_id, role: executionRole(this.service.store, authority) },
        connection.host,
        connection.actor.id,
        authority.client_id ?? undefined,
      );
    }
  }
  private admittedChat(event: StoredEvent, original: AiChatRow): AiChatRow {
    if (original.engine.kind !== 'openrouter') return original;
    const authority = eventAuthority(this.service.store, event);
    new OwnEngineSelections(this.service).migrate(
      original.id,
      authority.kind === 'service',
      authority.client_id ?? undefined,
    );
    return this.service.store.aiChats.chat(original.id);
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
        : this.service.store.clients.byId(authority.client_id);
    if (
      client !== undefined &&
      this.service.store.profiles.activeOf(client.id).id !== event.profile_id
    )
      throw new ApiError(
        'forbidden',
        'The initiating app changed its active profile before native delivery.',
      );
    const role = executionRole(this.service.store, authority);
    const connection = this.service.directory.get(this.service.binding(chat).execution_target);
    this.service.admitTarget(
      { profileId: event.profile_id, role },
      connection.host,
      connection.actor.id,
      authority.client_id ?? undefined,
    );
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
  private reusable(id: string | null, profile: string): boolean {
    return nativeSessionReusable(this.service, this.options.dispatcher, id, profile);
  }
  private async session(event: StoredEvent, original: AiChatRow): Promise<string | null> {
    const binding = this.service.binding(original);
    const authority = eventAuthority(this.service.store, event);
    let sessionId = binding.session_id;
    const reusable = this.reusable(sessionId, event.profile_id);
    if (!reusable) {
      if (!(await this.recovery.wait(event, original))) return null;
      const open = await openConversation(this.service, {
        owner: { profileId: event.profile_id, role: executionRole(this.service.store, authority) },
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
      { profileId: event.profile_id, role: executionRole(this.service.store, authority) },
      chat.id,
    );
    if (state.epoch === null)
      throw new ApiError('conflict', 'Native writer authority is unavailable.');
    const references = await deliveryReferences(this.service, event);
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
  private async auxiliary(request: SideRequest): Promise<string> {
    const chat = await ensureNativeControlSession(
      this.service,
      this.options.dispatcher,
      this.service.store.aiChats.chat(request.chatId),
    );
    const state = this.service.state({ profileId: chat.profile_id, role: 'member' }, chat.id);
    if (state.epoch === null)
      throw new ApiError('conflict', 'Native auxiliary writer authority is unavailable.');
    const messages = request.messages.map(
      (message): Extract<HarnessRuntimeRequest, { kind: 'auxiliary' }>['messages'][number] => {
        if (message.role === 'tool' || typeof message.content !== 'string')
          throw new ApiError(
            'invalid_request',
            'Native side completions require explicit textual helper messages.',
          );
        return { role: message.role, text: message.content };
      },
    );
    const receipt = await this.service.directory.execute(state.target, randomUUID(), {
      kind: 'auxiliary',
      session_id: state.session_id,
      expected_epoch: state.epoch,
      messages,
      max_tokens: request.maxTokens,
    });
    if (receipt.text === undefined)
      throw new ApiError(
        'upstream_failed',
        'The selected supplier returned no auxiliary completion.',
      );
    return receipt.text;
  }
  private async control(
    chat: AiChatRow,
    kind: 'interrupt' | 'compact' | 'close',
  ): Promise<HarnessRuntimeReceipt> {
    const admitted = await ensureNativeControlSession(
      this.service,
      this.options.dispatcher,
      chat,
      kind !== 'interrupt',
    );
    const state = this.service.state(
      { profileId: admitted.profile_id, role: 'member' },
      admitted.id,
    );
    if (state.epoch === null)
      throw new ApiError('conflict', 'Native writer authority is unavailable.');
    return this.service.directory.execute(state.target, randomUUID(), {
      kind,
      session_id: state.session_id,
      expected_epoch: state.epoch,
    });
  }
}
