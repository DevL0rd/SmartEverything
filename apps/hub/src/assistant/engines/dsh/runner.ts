import { assertHelperDelivery, helperParentMessageId } from '../../delegation/helper-delivery';
import {
  helperContinuation,
  helperContinuationReady,
  prepareDirectedHelper,
  submitHelperContinuation,
} from './helper-continuation';
import type { Continuation } from './helper-continuation';
import { deliveryReferences } from '../../../harness/reference-delivery';
import { effectiveClientOf } from '../../../server/person-access';
import { nativeControl } from './session-control';
import { rewriteNativeHistory } from '../../../harness/history-mutation';
import { OwnEngineSelections } from '../../../harness/own-selection';
import { ConversationProjector, type ActiveTurn } from './projector';
import { TurnMachineMoves } from './machine-moves';
import { midWorkMessage } from '../../conversation/prompt';
import { followDisconnectedTurns, nativeEngineStatus } from './host-lifecycle';
import { sessionAttached } from '../../../harness/attach';
import { closeNativeHistory } from './history-change';
import { followInterruptedHelpers } from './helper-wake';
import { nativeReplyId } from './projector-replay';
import { admitRestoredInput, restoredTurns } from './runner-restore';
import { recordPrompt } from './prompt-record';
import {
  eventAuthority,
  admitExecutionTarget,
  executionRole,
  withExecutionAuthority,
} from '../../turn-authority';
import { openConversation } from '../../../harness/opening';
import { randomUUID } from 'node:crypto';
import { DshTrace, steerSkipped, steered } from './runner-trace';
import { ApiError } from '@smarteverything/domain';
import type { AiChatRow } from '@smarteverything/domain';
import type { StoredEvent } from '../../../store/repositories/assistant-events';
import type { ConversationLog } from '../../conversation-log';
import type { Engine } from '../engine';
import type { HarnessService } from '../../../harness/service';
import type { HarnessDispatcher } from '@smarteverything/harness/process';
import type { StreamEmit } from '../../conversation/stream';
import { background, messageOf } from '@smarteverything/logging';

export class DshRunner {
  private readonly turns: ConversationProjector;
  private readonly moves: TurnMachineMoves<ActiveTurn>;
  private readonly unsent = new Set<string>();
  readonly restored: Promise<void>;
  constructor(
    private readonly options: {
      readonly service: HarnessService;
      readonly dispatcher: { readonly runtime: Pick<HarnessDispatcher['runtime'], 'pendingInput'> };
      readonly conversation: ConversationLog;
      readonly emit: StreamEmit;
      readonly finished: (event: StoredEvent, text: string, ok: boolean) => void;
    },
  ) {
    this.turns = new ConversationProjector(
      options,
      this.authorizeEvent.bind(this),
      (turn) => this.moves.atToolCall(turn),
      (turn, deliveryId, text) => this.resume(turn, deliveryId, text),
    );
    this.moves = new TurnMachineMoves(options.service, this.turns);
    this.restored = restoredTurns(this.turns, (input) =>
      options.dispatcher.runtime.pendingInput(input),
    );
    followInterruptedHelpers(options.service);
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
      activity: async (profileId) => [
        ...[...this.turns.active.values()]
          .filter((turn) => turn.event.profile_id === profileId)
          .map((turn) => turn.stream.current()),
        ...(await this.turns.sessions.activity(profileId)),
      ],
      ownerOnly: false,
      helperReady: (chat, role, attachments) =>
        helperContinuationReady(this.service, chat, role, {
          attachments,
          pendingInput: (input) => this.options.dispatcher.runtime.pendingInput(input),
        }),
      status: (chat) => nativeEngineStatus(this.service, chat, this.turns.hasChat(chat.id)),
      deliver: (event, chat) => this.deliver(event, chat),
      steer: (event, chat) => this.steer(event, chat),
      interrupt: async (chat): Promise<void> => {
        await this.restored;
        if (!(await this.turns.stopRetrying(chat.id)))
          await nativeControl(this.service, chat, { kind: 'interrupt' });
      },
      compact: async (chat): Promise<boolean> => {
        const receipt = await nativeControl(this.service, chat, { kind: 'compact' });
        if (receipt.compacted === undefined)
          throw new ApiError('conflict', 'Native compaction returned no confirmed outcome.');
        return receipt.compacted;
      },
      historyChanged: (chat, owner): Promise<void> => {
        if (chat.engine.kind !== 'dsh') return Promise.resolve();
        return this.turns
          .stopRetrying(chat.id)
          .then(() => closeNativeHistory(this.service, chat, owner, this.turns.hasChat(chat.id)));
      },
      historyRemoved: (chat, rows): Promise<void> => rewriteNativeHistory(this.service, chat, rows),
    };
  }
  private async deliver(event: StoredEvent, original: AiChatRow): Promise<void> {
    await this.restored;
    const authority = await eventAuthority(this.service.store, event);
    return withExecutionAuthority(authority, () => this.deliverAdmitted(event, original));
  }
  private async deliverAdmitted(event: StoredEvent, original: AiChatRow): Promise<void> {
    await new OwnEngineSelections(this.service).migrate(original.id);
    const { store } = this.service;
    const admitted = await store.host.call('aiChats', 'chat', original.id);
    if (helperParentMessageId(event) === null && (await this.runningChild(admitted))) {
      await this.steerChild(event, admitted);
      return;
    }
    await admitRestoredInput(this.service, admitted);
    const existing = await store.host.call('harnessDeliveries', 'find', event.id);
    const trace = new DshTrace(event, original.id);
    if (existing !== undefined) {
      trace.replayed(existing.state);
      return;
    }
    const { id: sessionId, helper } = await this.session(event, admitted);
    trace.sessionReady(sessionId);
    await this.admitEvent(event, admitted, sessionId);
    const chat = await store.host.call('aiChats', 'chat', original.id);
    const delivery = await this.conversation.admitNative({
      deliveryId: event.id,
      sessionId,
      start: { chat, replyTo: event.message_id, model: this.service.binding(chat).model },
    });
    const completed = this.turns.start(event, chat, nativeReplyId(delivery));
    try {
      trace.turnStarted(sessionId, this.service.binding(chat).model, nativeReplyId(delivery));
      await this.prompt(event, chat, helper);
      trace.promptSent();
    } catch (cause) {
      trace.promptFailed(cause, sessionId);
      this.failAdmitted(event, cause);
      background(
        completed.then(() => {
          this.unsent.delete(event.id);
        }),
        'turns.unsent_settle_failed',
      );
      return;
    }
    await completed;
    trace.turnFinished(sessionId);
    await this.moves.atTurnEnd(chat.id);
  }
  private async resume(turn: ActiveTurn, deliveryId: string, text: string): Promise<void> {
    const authority = await eventAuthority(this.service.store, turn.event);
    await withExecutionAuthority(authority, async () => {
      const chat = await this.service.store.host.call('aiChats', 'chat', turn.chat.id);
      const { id, helper } = await this.session(turn.event, chat);
      await this.admitEvent(turn.event, chat, id);
      if (this.unsent.has(turn.event.id)) {
        await this.prompt(turn.event, chat, helper);
        this.unsent.delete(turn.event.id);
        return;
      }
      const state = await this.service.state(
        { profileId: turn.event.profile_id, role: executionRole(authority) },
        chat.id,
      );
      if (state.epoch === null)
        throw new ApiError('conflict', 'Native writer authority is unavailable.');
      await this.service.directory.execute(state.target, randomUUID(), {
        kind: 'prompt',
        author: 'hub',
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
    this.unsent.add(event.id);
    this.turns.complete(active, {
      kind: 'failed',
      failure: {
        code: 'source_outcome_unknown',
        message: messageOf(cause).slice(0, 2000),
        retry_at: null,
      },
    });
  }
  private async steerable(event: StoredEvent, chat: AiChatRow): Promise<boolean> {
    if (event.message_id === null || chat.kind !== 'chat') return false;
    const message = await this.service.store.host.call(
      'assistantChat',
      'message',
      event.message_id,
    );
    return message.attachments.length === 0 && (message.references?.length ?? 0) === 0;
  }
  private async steer(event: StoredEvent, chat: AiChatRow): Promise<boolean> {
    const turn = this.turns.ofChat(chat.id);
    const steerable = turn !== undefined && (await this.steerable(event, chat));
    if (turn === undefined || this.moves.moves(chat.id) || !steerable) {
      steerSkipped(event, chat.id, {
        activeTurn: turn !== undefined,
        moving: this.moves.moves(chat.id),
        steerable,
      });
      return false;
    }
    const state = await this.service.state({ profileId: chat.profile_id, role: 'member' }, chat.id);
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
    if (event.message_id !== null) turn.stream.steer(event.message_id);
    await this.conversation.stateOf(event.message_id, 'delivered');
    return true;
  }
  private async runningChild(chat: AiChatRow): Promise<boolean> {
    if (chat.kind !== 'subagent') return false;
    if (chat.engine.kind !== 'dsh' || chat.engine.session_id === null) return false;
    const run = await this.service.store.host.call(
      'aiAgentRuns',
      'currentOfSession',
      chat.engine.session_id,
    );
    return run?.completed_at === null;
  }
  private async steerChild(event: StoredEvent, chat: AiChatRow): Promise<void> {
    await nativeControl(this.service, chat, { kind: 'steer', text: midWorkMessage(event.text) });
    await this.conversation.stateOf(event.message_id, 'answered');
    await this.service.store.host.call('assistantEvents', 'mark', event.id, 'answered_at');
    this.options.finished(event, '', true);
  }
  private async authorizeEvent(event: StoredEvent, chat: AiChatRow, id: string): Promise<void> {
    const { store } = this.service;
    const authority = await eventAuthority(store, event);
    admitExecutionTarget(store, chat, authority);
    await this.service.own({ profileId: event.profile_id, role: 'member' }, chat.id);
    if ((await store.host.call('dshSessions', 'stat', id, event.profile_id))?.chat_id !== chat.id)
      throw new ApiError('forbidden', 'Delivery cannot reuse another conversation native session.');
    const client =
      authority.client_id === null
        ? undefined
        : await effectiveClientOf(store, authority.client_id);
    if (
      client !== undefined &&
      (await store.host.call('profiles', 'activeOf', client.id)).id !== event.profile_id
    )
      throw new ApiError(
        'forbidden',
        'The initiating app changed its active profile before native delivery.',
      );
  }
  private async admitEvent(event: StoredEvent, chat: AiChatRow, id: string): Promise<void> {
    await this.authorizeEvent(event, chat, id);
    const authority = await eventAuthority(this.service.store, event);
    const role = executionRole(authority);
    if (helperParentMessageId(event) !== null) {
      const attachments = await assertHelperDelivery(this.service.store, chat, event);
      await helperContinuation(this.service, chat, role, attachments.length > 0);
      return;
    }
    const grant = await this.service.storage.grant(id);
    await this.service.store.host.call('harnessSessions', 'issue', {
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
  private async session(
    event: StoredEvent,
    original: AiChatRow,
  ): Promise<{ readonly id: string; readonly helper?: Continuation }> {
    const binding = this.service.binding(original);
    const authority = await eventAuthority(this.service.store, event);
    if (helperParentMessageId(event) !== null)
      return prepareDirectedHelper(this.service, original, event, {
        role: executionRole(authority),
        pendingInput: (input) => this.options.dispatcher.runtime.pendingInput(input),
      });
    let sessionId = binding.session_id;
    if (!(await sessionAttached(this.service, sessionId, event.profile_id))) {
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
    return { id: sessionId };
  }
  private async prompt(event: StoredEvent, chat: AiChatRow, helper?: Continuation): Promise<void> {
    const authority = await eventAuthority(this.service.store, event);
    if (helperParentMessageId(event) !== null) {
      if (helper === undefined)
        throw new ApiError('conflict', 'The admitted helper writer is unavailable.');
      return submitHelperContinuation(this.service, chat, event, {
        role: executionRole(authority),
        expected: helper,
      });
    }
    const state = await this.service.state(
      { profileId: event.profile_id, role: executionRole(authority) },
      chat.id,
    );
    if (state.epoch === null)
      throw new ApiError('conflict', 'Native writer authority is unavailable.');
    await recordPrompt(this.service.store, {
      deliveryId: event.id,
      sessionId: state.session_id,
      clientId: authority.client_id,
      startSeq: state.metadata.next_seq,
    });
    const references = await deliveryReferences(this.service, event);
    await this.service.directory.execute(state.target, event.id, {
      kind: 'prompt',
      author: await this.authorOf(event),
      session_id: state.session_id,
      expected_epoch: state.epoch,
      delivery_id: event.id,
      text: event.text,
      ...(references.length === 0 ? {} : { references: [...references] }),
      attachments:
        event.message_id === null
          ? []
          : (
              await this.service.store.host.call('assistantChat', 'attachmentsOf', event.message_id)
            ).map((file) => file.id),
    });
  }
  private async authorOf(event: StoredEvent): Promise<'person' | 'hub'> {
    if (event.message_id === null) return 'person';
    const { origin } = await this.service.store.host.call(
      'assistantChat',
      'message',
      event.message_id,
    );
    return origin?.source === 'hub' ? 'hub' : 'person';
  }
}
