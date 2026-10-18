import { CONNECTION_LOST, HUB_RESTARTED, STOPPED_BY_USER } from '../../interruption';
import {
  ApiError,
  type AiChatRow,
  type AssistantReasonCode,
  type Engine as ChatEngine,
  type JsonValue,
  type ChatActivityNotice,
  type ComputerRuntimeProviderTurn,
} from '@smarteverything/domain';
import type { StoredEvent } from '../../../store/repositories/assistant-events';
import { StoreNotFoundError } from '../../../store/context';
import type { Engine, EngineStatus } from '../engine';
import { ComputerTrace } from './runner-trace';
import { openProviderTurn } from './turn';
import { providerInput } from './input';
import { ProviderState, type ComputerControl, type ComputerEvent } from './provider-state';
import { failureLifecycle, interruptJob, publishProviderEvent } from './provider-wire';
import { NativeCommands } from './native-commands';
import { computerEngineStatus } from './engine-status';
import { providerAgents } from './agents';
import { subscriptionUsage } from './subscription-usage';
import { noteContext } from './context-meter';
import { settleSteered, steerTurn } from './steer';
import { bridgeTool, receiveToolResult } from './tool-feed';
import { streamNativeTools, streamDelta, isReplyEvent, type ReplyEvent } from './runtime-tools';
export type { Turn, ComputerRunnerDeps } from './ports';
import type { Turn, ComputerRunnerDeps } from './ports';
import { messageOf } from '@smarteverything/logging';

export class ComputerRunner {
  readonly state: ProviderState;
  readonly commands: NativeCommands;
  private readonly turns = new Map<string, Turn>();
  private readonly trace: ComputerTrace;
  private readonly unsubscribe: () => void;

  constructor(private readonly deps: ComputerRunnerDeps) {
    this.trace = new ComputerTrace(deps.log, deps.runtime);
    this.state = new ProviderState(deps.store, deps.directory, deps.runtime, deps.now);
    deps.store.aiProvider.interruptRestart();
    this.commands = new NativeCommands(deps, this.state, (chatId): boolean =>
      this.turns.has(chatId),
    );
    const received = (deviceId: string, event: ComputerEvent): void => {
      try {
        const chat = deps.store.aiChats.chat(event.chat_id);
        if (chat.engine.kind === deps.runtime && chat.engine.device_id === deviceId)
          this.received(chat, event);
      } catch (cause) {
        if (!(cause instanceof StoreNotFoundError)) throw cause;
      }
    };
    this.unsubscribe =
      deps.runtime === 'claude'
        ? deps.directory.onEvent(({ deviceId, event }) => {
            if (event.kind === 'provider') received(deviceId, event.event);
          })
        : deps.directory.runtimes.onEvent(({ target, event }) => {
            if (event.kind === 'provider' && event.runtime === 'codex')
              received(target.device_id, event.event);
          });
  }

  engine(): Engine {
    return {
      kind: this.deps.runtime,
      ownerOnly: true,
      historyChanged: (chat): Promise<void> => this.historyChanged(chat),
      status: (chat) => this.status(chat),
      deliver: (event, chat) => this.deliver(event, chat),
      steer: (event, chat): Promise<boolean> => this.steer(event, chat),
      compact: (chat, clientId): Promise<boolean> => {
        this.state.bound(chat);
        if (this.turns.has(chat.id))
          throw new ApiError('conflict', 'Wait for the provider turn to finish before compacting.');
        return this.commands.compact(chat, clientId);
      },
      interrupt: async (chat): Promise<void> => {
        await interruptJob(this.deps, this.state.bound(chat));
      },
    };
  }

  private steer(event: StoredEvent, chat: AiChatRow): Promise<boolean> {
    const turn = this.turns.get(chat.id);
    return steerTurn(
      this.deps,
      { state: this.state, turn, chat, current: () => this.turns.get(chat.id) === turn },
      event,
    );
  }

  private async historyChanged(chat: AiChatRow): Promise<void> {
    this.commands.guard(chat);
    if (this.turns.has(chat.id)) await this.control(chat, { action: 'close' });
    const state = this.state.read(chat);
    if (state.state === 'unknown')
      throw new ApiError(
        'conflict',
        'Provider effects are unknown; retain this conversation until its outcome is reconciled.',
      );
    if (
      state.job_id !== null &&
      this.deps.directory.runtimeStatus({ device_id: state.device_id, runtime: this.deps.runtime })
        .online
    )
      await this.state.control(chat, { action: 'close' });
    this.state.save(chat, {
      ...state,
      job_id: null,
      session_id: null,
      state: 'idle',
      prompts: [],
    });
  }

  async bindingChanged(chat: AiChatRow, engine: ChatEngine): Promise<void> {
    if (chat.engine.kind !== this.deps.runtime) return;
    const changed =
      engine.kind !== this.deps.runtime ||
      engine.device_id !== chat.engine.device_id ||
      engine.settings.cwd !== chat.engine.settings.cwd;
    if (!changed) return;
    this.commands.guard(chat);
    const state = this.state.read(chat);
    if (
      state.job_id !== null &&
      this.deps.directory.runtimeStatus({ device_id: state.device_id, runtime: this.deps.runtime })
        .online
    )
      await this.state.control(chat, { action: 'close' });
    this.state.save(chat, {
      ...state,
      job_id: null,
      session_id: null,
      metadata: null,
      prompts: [],
      state: 'idle',
    });
  }

  async control(chat: AiChatRow, control: ComputerControl): Promise<JsonValue> {
    const previous = this.state.bound(chat);
    const release = this.commands.beginControl(chat);
    let result: JsonValue;
    try {
      result = await this.state.control(chat, control);
    } finally {
      release();
    }
    const turn = this.turns.get(chat.id);
    if (
      turn !== undefined &&
      (control.action === 'close' ||
        (control.action === 'delete_session' && control.session_id === previous.session_id))
    )
      this.fail(turn, 'The provider session was closed.', 'unavailable');
    return result;
  }

  activity(profileId: string): ChatActivityNotice[] {
    return [...this.turns.values()]
      .filter((turn) => turn.chat.profile_id === profileId)
      .map((turn) => turn.stream.current());
  }

  stop(): void {
    this.unsubscribe();
    this.commands.stop();
    for (const turn of this.turns.values()) this.fail(turn, HUB_RESTARTED, 'close', 'interrupted');
  }

  private status(chat: AiChatRow): EngineStatus {
    return computerEngineStatus(
      this.deps,
      chat,
      this.turns.has(chat.id) || this.commands.busy(chat),
    );
  }

  private async deliver(event: StoredEvent, chat: AiChatRow): Promise<void> {
    let turn: Turn | null = null;
    try {
      if (chat.engine.kind !== this.deps.runtime)
        throw new ApiError('conflict', 'This is not a Claude provider chat.');
      const reason = this.status(chat).reason;
      if (reason !== null) {
        this.trace.notReady(chat, event, reason);
        throw new ApiError('claude_not_ready', reason);
      }
      this.commands.guard(chat);
      turn = openProviderTurn(this.deps, event, chat);
      this.turns.set(chat.id, turn);
      this.trace.started(turn, this.turns.size);
      await this.submit(turn);
      await turn.done;
    } catch (cause) {
      this.trace.errored(chat, event, turn, cause);
      const reason = messageOf(cause);
      if (turn !== null) this.fail(turn, reason);
      else {
        this.deps.conversation.failedMessage(event.message_id, reason, 'unknown');
        this.deps.finished(event, reason, false);
      }
    }
  }

  private async submit(turn: Turn): Promise<void> {
    const { chat, event } = turn;
    let previous = this.state.read(chat);
    if (this.deps.store.aiProvider.submitted(event.message_id)) {
      if (previous.job_id !== null) await this.state.control(chat, { action: 'close' });
      previous = { ...previous, job_id: null, session_id: null, prompts: [] };
    }
    const input = await providerInput(this.deps, turn, previous.session_id);
    this.state.save(chat, {
      ...previous,
      job_id: turn.jobId,
      managed_project: input.turn.managed_project,
      context:
        input.turn.managed_project === undefined && previous.managed_project !== undefined
          ? null
          : previous.context,
      state: 'working',
      reason: null,
      prompts: [],
      metadata: null,
    });
    this.deps.store.aiProvider.submitting(chat.id, event.message_id, turn.jobId);
    const sessionId =
      input.runtime === 'claude'
        ? (await this.deps.directory.startTurn(input.turn)).session_id
        : await this.codexStart(input);
    const current = this.state.read(chat);
    this.trace.submitted(turn, sessionId, current.job_id === turn.jobId);
    if (current.job_id === turn.jobId && sessionId !== null)
      this.state.save(chat, { ...current, session_id: sessionId });
  }

  private async codexStart(input: ComputerRuntimeProviderTurn): Promise<string | null> {
    const accepted = await this.deps.directory.startRuntimeTurn(input);
    if (accepted.reply.operation !== 'provider_start')
      throw new ApiError('upstream_failed', 'Expected provider start acknowledgement.');
    return accepted.reply.value.session_id;
  }

  private received(chat: AiChatRow, event: ComputerEvent): void {
    if (chat.engine.kind !== this.deps.runtime) return;
    if (!this.ownsEvent(chat, event)) return;
    providerAgents(this.deps, chat, event);
    if (!this.state.received(chat, event)) return;
    this.commands.received(chat, event);
    const usage = subscriptionUsage(
      event,
      this.deps.now().toISOString(),
      this.state.read(chat).subscription_usage,
    );
    if (usage !== undefined) this.deps.store.aiProvider.saveSubscriptionUsage(chat.id, usage);
    noteContext(this.deps.store, chat, event);
    publishProviderEvent(this.deps, chat, chat.engine.device_id, event);
    const turn = this.turns.get(chat.id);
    if (turn?.jobId !== event.job_id || this.turns.get(turn.chat.id) !== turn) return;
    this.feed(turn, event);
  }

  private ownsEvent(chat: AiChatRow, event: ComputerEvent): boolean {
    return this.state.read(chat).job_id === event.job_id || this.commands.accepted(chat, event);
  }
  private feed(turn: Turn, event: ComputerEvent): void {
    if (isReplyEvent(event)) this.feedReply(turn, event);
  }

  private feedReply(turn: Turn, event: ReplyEvent): void {
    switch (event.kind) {
      case 'text':
        turn.replies.text(event.delta);
        streamDelta(turn.stream, event);
        return;
      case 'thinking':
        streamDelta(turn.stream, event);
        return;
      case 'runtime':
        streamNativeTools(turn.stream, event);
        return;
      case 'tool_call':
        this.trace.toolRequested(turn, event.name, event.call_id);
        bridgeTool(
          {
            deps: this.deps,
            state: this.state,
            current: () => this.turns.get(turn.chat.id) === turn,
            fail: (reason): void => {
              this.fail(turn, reason);
            },
          },
          turn,
          event,
        );
        return;
      case 'tool_result':
        receiveToolResult(turn, event);
        return;
      case 'prompt':
      case 'dialog':
        this.trace.waiting(turn, event.kind);
        turn.stream.snapshot('tool', null, null);
        return;
      case 'completed':
        this.complete(turn, event.interrupted);
        return;
      case 'failed':
        this.failed(turn, event);
        return;
    }
  }

  private failed(turn: Turn, event: Extract<ComputerEvent, { kind: 'failed' }>): void {
    const lifecycle = failureLifecycle(this.deps.runtime, event.code);
    if (event.code === 'computer_disconnected')
      this.fail(turn, CONNECTION_LOST, lifecycle, 'interrupted');
    else this.fail(turn, event.message, lifecycle);
  }

  private complete(turn: Turn, interrupted: boolean): void {
    if (interrupted) {
      this.fail(turn, STOPPED_BY_USER, 'retained', 'stopped');
      return;
    }
    if (this.turns.get(turn.chat.id) !== turn) return;
    const text = turn.replies.fullText();
    this.trace.finished(turn, text.length);
    turn.replies.finish(turn.stream.settled());
    this.deps.conversation.stateOf(turn.event.message_id, 'answered');
    turn.stream.snapshot('idle', 'stop', null);
    this.deps.finished(turn.event, text, true);
    settleSteered(this.deps, turn, { ok: true, text });
    this.close(turn);
  }

  private fail(
    turn: Turn,
    reason: string,
    lifecycle: 'close' | 'retained' | 'unavailable' | 'unknown' = 'close',
    code: AssistantReasonCode = 'unknown',
  ): void {
    if (this.turns.get(turn.chat.id) !== turn) return;
    this.trace.failed(turn, { lifecycle, code, reason });
    turn.replies.fail(reason, turn.stream.settled(), code);
    if (lifecycle === 'close') this.release(turn);
    this.deps.conversation.failedMessage(turn.event.message_id, reason, code);
    turn.stream.snapshot('failed', 'error', reason.slice(0, 400));
    const state = this.state.read(turn.chat);
    if (state.job_id === turn.jobId) {
      const failed = {
        ...state,
        reason: reason.slice(0, 2000),
        job_id: lifecycle === 'retained' ? turn.jobId : null,
        prompts: [],
        context: null,
      };
      this.state.save(
        turn.chat,
        failed.runtime === 'codex'
          ? { ...failed, state: lifecycle === 'unknown' ? 'unknown' : 'failed' }
          : { ...failed, state: 'failed' },
      );
    }
    this.deps.finished(turn.event, reason, false);
    settleSteered(this.deps, turn, { ok: false, reason, code });
    this.close(turn);
  }

  private release(turn: Turn): void {
    const target = { device_id: turn.chat.engine.device_id, runtime: this.deps.runtime };
    if (!this.deps.directory.runtimeStatus(target).online) return;
    void this.state.control(turn.chat, { action: 'close' }).catch((cause: unknown) => {
      this.deps.log.error('computer.close_failed', cause, {
        chatId: turn.chat.id,
        runtime: target.runtime,
      });
    });
  }

  private close(turn: Turn): void {
    this.trace.closed(turn.chat.id);
    turn.stream.close();
    this.turns.delete(turn.chat.id);
    turn.finish();
  }
}
