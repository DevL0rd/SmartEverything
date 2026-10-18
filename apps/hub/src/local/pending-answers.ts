import { ApiError, PUSH_ACTION_ANSWER_SECONDS } from '@smarteverything/domain';

export const ANSWER_TIMEOUT_MS = PUSH_ACTION_ANSWER_SECONDS * 1000;

interface Pending<R> {
  readonly clients: readonly string[];
  readonly resolve: (result: R) => void;
  readonly timer: NodeJS.Timeout;
}

export interface AnswerWait<R> {
  readonly requestId: string;
  readonly clients: readonly string[];
  readonly timeoutMs: number;
  readonly unanswered: () => R;
}

export class PendingAnswers<R> {
  private readonly pending = new Map<string, Pending<R>>();

  constructor(private readonly what: string) {}

  wait(request: AnswerWait<R>): Promise<R> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.requestId);
        resolve(request.unanswered());
      }, request.timeoutMs);
      this.pending.set(request.requestId, { clients: request.clients, resolve, timer });
    });
  }

  has(requestId: string): boolean {
    return this.pending.has(requestId);
  }

  answer(clientId: string, requestId: string, result: R): void {
    const pending = this.pending.get(requestId);
    if (pending === undefined) {
      throw new ApiError('not_found', `This ${this.what} already finished or was never sent.`);
    }
    if (!pending.clients.includes(clientId)) {
      throw new ApiError('forbidden', 'This phone was not asked to do that.');
    }
    clearTimeout(pending.timer);
    this.pending.delete(requestId);
    pending.resolve(result);
  }

  stop(result: R): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.resolve(result);
    }
    this.pending.clear();
  }
}
