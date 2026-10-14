import type { Context } from '@deepseek-ai/cordis';
import { awaitInteraction } from './cancellation';
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval';
import type { ApprovalRequestEvent } from '@deepseek-ai/dsh-user-approval/types';
import type {
  AskUserQuestionAnswer,
  AskUserQuestionRequestEvent,
} from '@deepseek-ai/dsh-user-questions/types';

export interface HarnessInteractionPort {
  approve(request: ApprovalRequestEvent): Promise<ApprovalOutcome>;
  question(request: AskUserQuestionRequestEvent): Promise<AskUserQuestionAnswer>;
}

export class HarnessInteractions {
  private readonly pending = new Map<string, number>();

  constructor(ctx: Context, port: HarnessInteractionPort) {
    ctx.on('approval/request', (request) =>
      this.track(request.agent.id, () => port.approve(request), request.signal),
    );
    ctx.on('user-questions/request', (request, next) => {
      if (request.agent === undefined) return next();
      return this.track(request.agent.id, () => port.question(request), request.signal);
    });
  }

  count(id: string): number {
    return this.pending.get(id) ?? 0;
  }

  private async track<T>(id: string, work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    this.pending.set(id, this.count(id) + 1);
    try {
      return await awaitInteraction(work, signal);
    } finally {
      const remaining = this.count(id) - 1;
      if (remaining === 0) this.pending.delete(id);
      else this.pending.set(id, remaining);
    }
  }
}
