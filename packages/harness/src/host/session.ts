import type { CompactionResult } from '@deepseek-ai/dsh-compaction';
import { HarnessHumanCommands } from './human-commands';
import type {
  CommandDescriptor,
  CommandExecution,
  CommandSubmitAttachment,
} from '@deepseek-ai/dsh-commands';
import { HarnessRuntimeError } from './errors';
import type { AgentCancelCause, AgentHandle } from '@deepseek-ai/dsh-agent';
import type { Context } from '@deepseek-ai/cordis';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import type { UserMessage } from '@deepseek-ai/dsh-llm';
import type { AiHarnessPermission } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { MachineSessionPersistence } from '../persistence/service';
import { cancelOwnedJobs, JOB_CLEANUP_WINDOW_MS } from './job-cleanup';
import type { HarnessCleanup } from './job-cleanup';
import { setSessionPermission } from './permission';
import type { HarnessInteractions } from './interactions';
import { assertDrained, sessionWork } from './work';
import type { HarnessWork } from './work';

const log = new Logger('hub.harness');

export class HarnessSession {
  private frozen = false;
  private closing: Promise<void> | undefined;
  private nativeDisposal: Promise<void> | undefined;
  private nativeDisposalFinalizationOnly = false;
  private lostOwnership = false;
  private ownershipCleanup: Promise<void> | undefined;
  private stopping: Promise<void> | undefined;
  private compacting = false;
  private cleanup: HarnessCleanup = { state: 'idle' };
  private readonly persistence: MachineSessionPersistence;
  private readonly humanCommands: HarnessHumanCommands;

  constructor(
    private readonly ctx: Context,
    private readonly handle: AgentHandle,
    private readonly interactions: HarnessInteractions,
    private readonly settled: () => void,
  ) {
    const persistence = ctx.get('sessionPersistence');
    if (!(persistence instanceof MachineSessionPersistence))
      throw new HarnessRuntimeError(
        'runtime_unavailable',
        'Native hub persistence is unavailable.',
      );
    this.persistence = persistence;
    this.humanCommands = new HarnessHumanCommands(ctx, handle.agent);
  }

  get id(): string {
    return this.handle.agent.id;
  }

  work(): HarnessWork {
    return sessionWork(this.ctx, this.handle.agent, this.interactions, this.cleanup);
  }

  quiet(): boolean {
    const work = this.work();
    return (
      !this.lostOwnership &&
      this.closing === undefined &&
      this.stopping === undefined &&
      !this.compacting &&
      !this.humanCommands.active() &&
      !work.turn &&
      work.interactions === 0 &&
      work.queuedMessages === 0
    );
  }

  prompt(message: UserMessage): void {
    this.assertAdmitted();
    log.debug('session.prompt_queued', () => ({ session_id: this.id, ...this.workFields() }));
    this.handle.agent.followup(message);
  }

  text(text: string): void {
    this.prompt(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }));
  }

  steer(message: UserMessage): void {
    this.assertAdmitted();
    log.debug('session.steer_queued', () => ({ session_id: this.id, ...this.workFields() }));
    this.handle.agent.steer(message);
  }

  note(message: UserMessage): void {
    this.assertAdmitted();
    log.debug('session.note_injected', { session_id: this.id });
    this.handle.agent.inject(message);
  }

  private workFields(): Record<string, unknown> {
    const work = this.work();
    return {
      turnRunning: work.turn,
      interactions: work.interactions,
      queuedMessages: work.queuedMessages,
      shells: work.shells.length,
    };
  }

  async interrupt(): Promise<void> {
    const startedAt = performance.now();
    log.info('session.interrupt_started', { session_id: this.id, ...this.workFields() });
    await this.stop({ kind: 'user' }, 'User interrupted the session.');
    await this.flush();
    this.settled();
    log.info('session.interrupt_finished', {
      session_id: this.id,
      durationMs: Math.round(performance.now() - startedAt),
    });
  }

  ownershipLost(): Promise<void> {
    this.freeze();
    this.lostOwnership = true;
    log.warn('session.ownership_lost', { session_id: this.id, ...this.workFields() });
    this.ownershipCleanup ??= this.stop(
      { kind: 'hook', reason: 'Session writer ownership was lost.' },
      'Session writer ownership was lost.',
    ).catch((error: unknown) => {
      this.ownershipCleanup = undefined;
      throw error;
    });
    return this.ownershipCleanup;
  }

  whenOwnershipLossSettled(): Promise<void> {
    return this.ownershipCleanup ?? (this.lostOwnership ? this.ownershipLost() : Promise.resolve());
  }

  async flush(): Promise<void> {
    if (!(await this.ctx.sessions.flush(this.handle.agent.session)))
      throw new HarnessRuntimeError(
        'runtime_unavailable',
        'The native session is no longer registered for its durability barrier.',
        this.id,
      );
  }

  commands(): readonly CommandDescriptor[] {
    this.assertAdmitted();
    return this.ctx.commands.list(this.handle.agent);
  }

  async command(
    line: string,
    attachments: readonly CommandSubmitAttachment[],
  ): Promise<CommandExecution | undefined> {
    this.assertAdmitted();
    const startedAt = performance.now();
    log.debug('session.command_started', {
      session_id: this.id,
      lineLength: line.length,
      attachments: attachments.length,
    });
    try {
      const execution = await this.humanCommands.execute(line, attachments);
      log.debug('session.command_finished', () => ({
        session_id: this.id,
        handled: execution !== undefined,
        durationMs: Math.round(performance.now() - startedAt),
      }));
      return execution;
    } catch (error) {
      log.warn('session.command_failed', {
        session_id: this.id,
        cause: error instanceof Error ? error.name : typeof error,
        durationMs: Math.round(performance.now() - startedAt),
      });
      throw error;
    } finally {
      await this.flush();
      this.settled();
    }
  }

  async compact(): Promise<CompactionResult | null> {
    this.assertAdmitted();
    this.compacting = true;
    const startedAt = performance.now();
    log.info('session.compaction_started', { session_id: this.id, ...this.workFields() });
    try {
      const result = await this.ctx.compaction.compactNow(
        this.handle.agent,
        new AbortController().signal,
      );
      log.info('session.compaction_finished', {
        session_id: this.id,
        compacted: result !== null,
        durationMs: Math.round(performance.now() - startedAt),
      });
      return result;
    } catch (error) {
      log.error('session.compaction_failed', error, {
        session_id: this.id,
        durationMs: Math.round(performance.now() - startedAt),
      });
      throw error;
    } finally {
      this.compacting = false;
      await this.flush();
      this.settled();
    }
  }

  directory(path: string, signal?: AbortSignal): Promise<string> {
    this.assertAdmitted();
    return this.ctx.workingDirectory.set(this.handle.agent, path, signal);
  }

  async permission(input: AiHarnessPermission): Promise<void> {
    this.assertAdmitted();
    setSessionPermission(this.ctx, this.handle.agent, input);
    log.info('session.permission_set', {
      session_id: this.id,
      sandbox: input.sandbox,
      approval: input.approval,
    });
    await this.flush();
  }

  freeze(): void {
    this.frozen = true;
  }

  async drain(): Promise<void> {
    log.debug('session.drain_started', () => ({ session_id: this.id, ...this.workFields() }));
    this.freeze();
    await this.humanCommands.settle();
    await this.handle.agent.whenIdle();
    assertDrained(this.work());
    await this.flush();
  }

  close(): Promise<void> {
    this.freeze();
    this.closing ??= this.finishClose().catch((error: unknown) => {
      this.closing = undefined;
      throw error;
    });
    return this.closing;
  }

  private stop(cause: AgentCancelCause, reason: string): Promise<void> {
    this.stopping ??= this.performStop(cause, reason).finally(() => {
      this.stopping = undefined;
    });
    return this.stopping;
  }

  private async performStop(cause: AgentCancelCause, reason: string): Promise<void> {
    const startedAt = performance.now();
    log.info('session.stop_started', {
      session_id: this.id,
      cause: cause.kind,
      ...this.workFields(),
    });
    this.cleanup = { state: 'running' };
    this.humanCommands.cancel(reason);
    const failures: unknown[] = [];
    try {
      this.handle.agent.cancel(cause, { keepInbox: this.lostOwnership });
    } catch (error) {
      failures.push(error);
    }
    const results = await Promise.allSettled([
      this.awaitIdle(),
      this.humanCommands.settle(),
      cancelOwnedJobs(this.ctx, this.handle.agent, reason),
    ]);
    for (const result of results) if (result.status === 'rejected') failures.push(result.reason);
    const work = this.work();
    if (failures.length > 0 || work.turn || work.interactions > 0 || work.shells.length > 0) {
      log.error('session.stop_unproven', undefined, {
        session_id: this.id,
        failures: failures.length,
        ...this.workFields(),
        durationMs: Math.round(performance.now() - startedAt),
      });
      this.cleanup = {
        state: 'unknown',
        jobs: work.shells,
        reason: 'Native work or background cleanup could not be proved complete.',
      };
      throw new HarnessRuntimeError('source_outcome_unknown', this.cleanup.reason, this.id, {
        cause: new AggregateError(failures, 'Native session cleanup failed.'),
      });
    }
    this.cleanup = { state: 'completed' };
    log.info('session.stop_finished', {
      session_id: this.id,
      cause: cause.kind,
      durationMs: Math.round(performance.now() - startedAt),
    });
  }

  private async awaitIdle(): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.handle.agent.whenIdle(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            log.error('session.idle_timeout', undefined, {
              session_id: this.id,
              deadlineMs: JOB_CLEANUP_WINDOW_MS,
              ...this.workFields(),
            });
            reject(
              new HarnessRuntimeError(
                'source_outcome_unknown',
                'Native session did not become idle before its cleanup deadline.',
                this.id,
              ),
            );
          }, JOB_CLEANUP_WINDOW_MS);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private async finishClose(): Promise<void> {
    log.debug('session.close_started', {
      session_id: this.id,
      redispose: this.nativeDisposal !== undefined,
    });
    if (this.nativeDisposal === undefined) {
      await this.stop({ kind: 'disposed' }, 'Session is closing.');
      this.nativeDisposal = this.handle.dispose();
      await this.nativeDisposal;
    } else {
      try {
        await this.nativeDisposal;
      } catch (error) {
        this.nativeDisposalFinalizationOnly ||= this.persistence.finalizationFailure(
          this.id,
          error,
        );
        await this.persistence.finalize(this.id);
        if (!this.nativeDisposalFinalizationOnly) throw error;
      }
    }
    await this.persistence.finalize(this.id);
    this.assertReleased();
    log.debug('session.close_finished', { session_id: this.id });
  }

  private assertReleased(): void {
    const work = this.work();
    if (
      this.ctx.agents.get(this.handle.agent.id) !== undefined ||
      this.ctx.sessions.get(this.handle.agent.id) !== undefined ||
      work.turn ||
      work.interactions > 0 ||
      work.shells.length > 0
    )
      throw new HarnessRuntimeError(
        'source_outcome_unknown',
        'Native agent or managed work remains after session disposal.',
        this.id,
      );
  }

  private assertAdmitted(): void {
    if (this.frozen)
      throw new HarnessRuntimeError(
        'operation_failed',
        `Session ${this.id} prompt admission is frozen.`,
      );
  }
}
