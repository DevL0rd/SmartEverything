import { CONNECTION_LOST, HUB_RESTARTED, STOPPED_BY_USER } from '../../interruption';
import {
  ApiError,
  type AiChatRow,
  type AssistantReasonCode,
  type Engine as ChatEngine,
  type JsonValue,
  type ChatActivityNotice,
} from '@smarteverything/domain';
import type { StoredEvent } from '../../../store/repositories/assistant-events';
import type { Engine, EngineStatus } from '../engine';
import { ComputerTrace } from './runner-trace';
import { assertProviderHelperDelivery, openProviderTurn } from './turn';
import { preflightProviderInput, providerInput } from './input';
import { ProviderState, type ComputerControl, type ComputerEvent } from './provider-state';
import { failureLifecycle, interruptJob, publishProviderEvent } from './provider-wire';
import { NativeCommands } from './native-commands';
import { computerEngineStatus } from './engine-status';
import { afterTurnWrites, settleSteered, steerTurn } from './steer';
import {
  arrivedChat,
  codexStart,
  failedTurnState,
  recordedProviderEvent,
  submitFailureLifecycle,
} from './provider-intake';
import { bridgeTool, receiveToolResult } from './tool-feed';
import { streamNativeTools, streamDelta, isReplyEvent, type ReplyEvent } from './runtime-tools';
export type { Turn, ComputerRunnerDeps } from './ports';
import type { Turn, ComputerRunnerDeps } from './ports';
import { background, messageOf } from '@smarteverything/logging';
import { CommandLanes } from '../../../commands/lanes';

export class ComputerRunner {
  readonly state: ProviderState;
  readonly commands: NativeCommands;
  private readonly turns = new Map<string, Turn>();
  private readonly trace: ComputerTrace;
  private readonly unsubscribe: () => void;
  private readonly restarted: Promise<void>;
  private readonly lanes = new CommandLanes();

  constructor(private readonly deps: ComputerRunnerDeps) {
    this.trace = new ComputerTrace(deps.log, deps.runtime);
    this.state = new ProviderState(deps.store, deps.directory, deps.runtime);
    this.restarted = deps.store.host.call('aiProvider', 'interruptRestart');
    background(this.restarted, 'computer.restart_interrupt_failed', { runtime: deps.runtime });
    this.commands = new NativeCommands(deps, this.state, (chatId): boolean =>
      this.turns.has(chatId),
    );
    const received = (deviceId: string, event: ComputerEvent): void => {
      background(
        this.lanes.run(event.chat_id, () => this.arrived(deviceId, event)),
        'computer.event_failed',
        { chatId: event.chat_id, runtime: deps.runtime },
      );
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

  private async arrived(deviceId: string, event: ComputerEvent): Promise<void> {
    await this.restarted;
    const chat = await arrivedChat(this.deps, deviceId, event);
    if (chat !== null) await this.received(chat, event);
  }

  engine(): Engine {
    return {
      kind: this.deps.runtime,
      ownerOnly: true,
      historyChanged: (chat): Promise<void> => this.historyChanged(chat),
      status: (chat) => this.status(chat),
      deliver: (event, chat) => this.deliver(event, chat),
      preflightHelperInput: async (input): Promise<void> => {
        await preflightProviderInput(
          this.deps,
          input,
          (await this.state.read(input.target)).session_id,
        );
      },
      steer: (event, chat): Promise<boolean> => this.steer(event, chat),
      compact: async (chat, clientId): Promise<boolean> => {
        await this.state.bound(chat);
        if (this.turns.has(chat.id))
          throw new ApiError('conflict', 'Wait for the provider turn to finish before compacting.');
        return this.commands.compact(chat, clientId);
      },
      interrupt: async (chat): Promise<void> => {
        await interruptJob(this.deps, await this.state.bound(chat));
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
    await this.commands.guard(chat);
    if (this.turns.has(chat.id)) await this.control(chat, { action: 'close' });
    const state = await this.state.read(chat);
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
    await this.state.save(chat, {
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
    await this.commands.guard(chat);
    const state = await this.state.read(chat);
    if (
      state.job_id !== null &&
      this.deps.directory.runtimeStatus({ device_id: state.device_id, runtime: this.deps.runtime })
        .online
    )
      await this.state.control(chat, { action: 'close' });
    await this.state.save(chat, {
      ...state,
      job_id: null,
      session_id: null,
      metadata: null,
      prompts: [],
      state: 'idle',
    });
  }

  async control(chat: AiChatRow, control: ComputerControl): Promise<JsonValue> {
    const previous = await this.state.bound(chat);
    const release = await this.commands.beginControl(chat);
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

  async stop(): Promise<void> {
    this.unsubscribe();
    for (const turn of this.turns.values()) this.fail(turn, HUB_RESTARTED, 'close', 'interrupted');
    await this.commands.stop();
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
      await this.restarted;
      await this.commands.guard(chat);
      turn = await openProviderTurn(this.deps, event, chat);
      this.turns.set(chat.id, turn);
      this.trace.started(turn, this.turns.size);
      await this.submit(turn);
      await turn.done;
    } catch (cause) {
      this.trace.errored(chat, event, turn, cause);
      const reason = messageOf(cause);
      if (turn !== null) this.fail(turn, reason, await submitFailureLifecycle(this.state, turn));
      else {
        await this.deps.conversation.failedMessage(event.message_id, reason, 'unknown');
        this.deps.finished(event, reason, false);
      }
    }
  }

  private async submit(turn: Turn): Promise<void> {
    await assertProviderHelperDelivery(this.deps, turn);
    const { chat, event } = turn;
    let previous = await this.state.read(chat);
    if (await this.deps.store.host.call('aiProvider', 'submitted', event.message_id)) {
      if (previous.job_id !== null) await this.state.control(chat, { action: 'close' });
      previous = { ...previous, job_id: null, session_id: null, prompts: [] };
    }
    const { input, engine } = await providerInput(this.deps, turn, previous.session_id);
    const active = this.turns.get(chat.id);
    if (active !== turn) return;
    await assertProviderHelperDelivery(this.deps, turn, input);
    active.executionEngine = engine;
    await this.state.save(chat, {
      ...previous,
      job_id: turn.jobId,
      managed_project: input.turn.managed_project,
      context:
        input.runtime === 'codex' ||
        (input.turn.managed_project === undefined && previous.managed_project !== undefined)
          ? null
          : previous.context,
      state: 'working',
      reason: null,
      prompts: [],
      metadata: null,
    });
    await this.deps.store.host.call(
      'aiProvider',
      'submitting',
      chat.id,
      event.message_id,
      turn.jobId,
    );
    const sessionId =
      input.runtime === 'claude'
        ? (await this.deps.directory.startTurn(input.turn)).session_id
        : await codexStart(this.deps, input);
    const current = await this.state.read(chat);
    this.trace.submitted(turn, sessionId, current.job_id === turn.jobId);
    if (current.job_id === turn.jobId && sessionId !== null)
      await this.state.save(chat, { ...current, session_id: sessionId });
  }

  private async received(chat: AiChatRow, event: ComputerEvent): Promise<void> {
    if (chat.engine.kind !== this.deps.runtime) return;
    if (!(await recordedProviderEvent(this.deps, this, chat, event))) return;
    publishProviderEvent(this.deps, chat, chat.engine.device_id, event);
    const turn = this.turns.get(chat.id);
    if (turn?.jobId !== event.job_id || this.turns.get(turn.chat.id) !== turn) return;
    this.feed(turn, event);
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
    const written = Promise.all([
      turn.replies.finish(turn.stream.settled()),
      this.deps.conversation.stateOf(turn.event.message_id, 'answered'),
    ]);
    turn.stream.snapshot('idle', 'stop', null);
    this.settle(turn, written, () => {
      this.deps.finished(turn.event, text, true);
      settleSteered(this.deps, turn, { ok: true, text });
    });
  }

  private fail(
    turn: Turn,
    reason: string,
    lifecycle: 'close' | 'retained' | 'unavailable' | 'unknown' = 'close',
    code: AssistantReasonCode = 'unknown',
  ): void {
    if (this.turns.get(turn.chat.id) !== turn) return;
    this.trace.failed(turn, { lifecycle, code, reason });
    const written = Promise.all([
      turn.replies.fail(reason, turn.stream.settled(), code),
      this.deps.conversation.failedMessage(turn.event.message_id, reason, code),
      failedTurnState(this.state, turn, reason, lifecycle),
    ]);
    if (lifecycle === 'close') this.release(turn);
    turn.stream.snapshot('failed', 'error', reason.slice(0, 400));
    this.settle(turn, written, () => {
      this.deps.finished(turn.event, reason, false);
      settleSteered(this.deps, turn, { ok: false, reason, code });
    });
  }

  private settle(turn: Turn, written: Promise<unknown>, after: () => void): void {
    this.trace.closed(turn.chat.id);
    turn.stream.close();
    this.turns.delete(turn.chat.id);
    afterTurnWrites(this.deps, turn, written, after);
  }

  private release(turn: Turn): void {
    const target = { device_id: turn.chat.engine.device_id, runtime: this.deps.runtime };
    if (!this.deps.directory.runtimeStatus(target).online) return;
    void this.state.control(turn.chat, { action: 'close' }).catch((cause: unknown) => {
      this.deps.log.warn('computer.close_failed', {
        chatId: turn.chat.id,
        runtime: target.runtime,
        failure: messageOf(cause),
      });
    });
  }
}
