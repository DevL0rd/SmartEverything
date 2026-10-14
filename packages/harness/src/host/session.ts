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
import { HubSessionPersistence } from '../persistence/service';
import { cancelOwnedJobs, JOB_CLEANUP_TIMEOUT_MS } from './job-cleanup';
import type { HarnessCleanup } from './job-cleanup';
import { setSessionPermission } from './permission';
import type { HarnessInteractions } from './interactions';
import { assertDrained, sessionWork } from './work';
import type { HarnessWork } from './work';

export class HarnessSession {
  private frozen = false;
  private closing: Promise<void> | undefined;
  private nativeDisposal: Promise<void> | undefined;
  private nativeDisposalFinalizationOnly = false;
  private lostOwnership = false;
  private ownershipCleanup: Promise<void> | undefined;
  private stopping: Promise<void> | undefined;
  private cleanup: HarnessCleanup = { state: 'idle' };
  private readonly persistence: HubSessionPersistence;
  private readonly humanCommands: HarnessHumanCommands;

  constructor(
    private readonly ctx: Context,
    private readonly handle: AgentHandle,
    private readonly interactions: HarnessInteractions,
  ) {
    const persistence = ctx.get('sessionPersistence');
    if (!(persistence instanceof HubSessionPersistence))
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

  prompt(message: UserMessage): void {
    this.assertAdmitted();
    this.handle.agent.followup(message);
  }

  text(text: string): void {
    this.prompt(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }));
  }

  steer(message: UserMessage): void {
    this.assertAdmitted();
    this.handle.agent.steer(message);
  }

  async interrupt(): Promise<void> {
    await this.stop({ kind: 'user' }, 'User interrupted the session.');
    await this.flush();
  }

  ownershipLost(): Promise<void> {
    this.freeze();
    this.lostOwnership = true;
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
    try {
      return await this.humanCommands.execute(line, attachments);
    } finally {
      await this.flush();
    }
  }

  compact(): Promise<unknown> {
    this.assertAdmitted();
    return this.ctx.compaction.compactNow(this.handle.agent, new AbortController().signal);
  }

  directory(path: string): Promise<string> {
    this.assertAdmitted();
    return this.ctx.workingDirectory.set(this.handle.agent, path);
  }

  async permission(input: AiHarnessPermission): Promise<void> {
    this.assertAdmitted();
    setSessionPermission(this.ctx, this.handle.agent, input);
    await this.flush();
  }

  freeze(): void {
    this.frozen = true;
  }

  async drain(): Promise<void> {
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
  }

  private async awaitIdle(): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.handle.agent.whenIdle(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            reject(
              new HarnessRuntimeError(
                'source_outcome_unknown',
                'Native session did not become idle before its cleanup deadline.',
                this.id,
              ),
            );
          }, JOB_CLEANUP_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private async finishClose(): Promise<void> {
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
