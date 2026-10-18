import { randomUUID } from 'node:crypto';
import type { JsonValue, PushCommand } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { PushCommandChannel, PushCommandOutcome } from '../extensions/push/commands';
import { ANSWER_TIMEOUT_MS, PendingAnswers } from './pending-answers';

export interface PushAsk<R> {
  readonly command: PushCommand;
  readonly clients: readonly string[];
  readonly payload: Readonly<Record<string, JsonValue>>;
  readonly timeoutMs?: number;
  readonly settledCommand?: PushCommand;
  readonly sent: (tally: { readonly asked: number; readonly reached: number }) => void;
  readonly unreachable: (outcomes: readonly PushCommandOutcome[]) => R;
  readonly unanswered: () => R;
}

export class PushAsks<R> {
  private readonly answers: PendingAnswers<R>;

  constructor(
    what: string,
    private readonly push: PushCommandChannel,
  ) {
    this.answers = new PendingAnswers<R>(what);
  }

  async ask(request: PushAsk<R>): Promise<R> {
    const requestId = randomUUID();
    const timeoutMs = request.timeoutMs ?? ANSWER_TIMEOUT_MS;
    const payload = {
      ...request.payload,
      requestId,
      expiresAt: new Date(Date.now() + timeoutMs).toISOString(),
    };
    const sent = await Promise.all(
      request.clients.map(async (clientId) => ({
        clientId,
        outcome: await this.push.send({ clientId, command: request.command, payload }),
      })),
    );
    const reached = sent.filter(({ outcome }) => outcome.outcome === 'sent');
    request.sent({ asked: sent.length, reached: reached.length });
    if (reached.length === 0) {
      return request.unreachable(sent.map(({ outcome }) => outcome));
    }
    const clients = reached.map(({ clientId }) => clientId);
    const result = await this.answers.wait({
      requestId,
      clients,
      timeoutMs,
      unanswered: request.unanswered,
    });
    this.settled(request.settledCommand, requestId, clients);
    return result;
  }

  private settled(
    command: PushCommand | undefined,
    requestId: string,
    clients: readonly string[],
  ): void {
    if (command === undefined) {
      return;
    }
    clients.forEach((clientId) => {
      background(
        this.push.send({ clientId, command, payload: { requestId } }),
        'push.settled_failed',
        { command },
      );
    });
  }

  has(requestId: string): boolean {
    return this.answers.has(requestId);
  }

  answer(clientId: string, requestId: string, result: R): void {
    this.answers.answer(clientId, requestId, result);
  }

  stop(result: R): void {
    this.answers.stop(result);
  }
}
