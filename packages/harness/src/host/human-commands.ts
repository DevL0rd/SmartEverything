import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { CommandExecution, CommandSubmitAttachment } from '@deepseek-ai/dsh-commands';
import { HarnessRuntimeError } from './errors';

export class HarnessHumanCommands {
  private controller: AbortController | undefined;
  private pending: Promise<CommandExecution | undefined> | undefined;
  constructor(
    private readonly ctx: Context,
    private readonly agent: Agent,
  ) {}

  active(): boolean {
    return this.pending !== undefined;
  }

  execute(
    line: string,
    attachments: readonly CommandSubmitAttachment[],
  ): Promise<CommandExecution | undefined> {
    if (this.pending !== undefined)
      throw new HarnessRuntimeError('operation_failed', 'Another human command is still running.');
    const controller = new AbortController();
    this.controller = controller;
    const pending = this.ctx.commands
      .execute(this.agent, line, attachments, controller.signal)
      .finally(() => {
        if (this.pending === pending) {
          this.pending = undefined;
          this.controller = undefined;
        }
      });
    this.pending = pending;
    return pending;
  }

  cancel(reason: string): void {
    this.controller?.abort(new HarnessRuntimeError('source_outcome_unknown', reason));
  }

  async settle(): Promise<void> {
    const controller = this.controller;
    try {
      await this.pending;
    } catch (cause) {
      if (controller?.signal.aborted !== true || cause !== controller.signal.reason) throw cause;
    }
  }
}
