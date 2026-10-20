import { randomUUID } from 'node:crypto';
import {
  APP_VIEW_ANSWER_SECONDS,
  type AppViewNotice,
  type AppViewRequest,
  type AppViewResult,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { PendingAnswers } from '../local/pending-answers';

export type AppViewAsk = Omit<AppViewRequest, 'requestId'>;

export type AppViewOutcome =
  | { readonly kind: 'answered'; readonly result: AppViewResult }
  | { readonly kind: 'not_reached' }
  | { readonly kind: 'unanswered' };

export type AppViewDelivery = (clientId: string, notice: AppViewNotice) => Promise<number>;

export const APP_VIEW_ANSWER_MS = APP_VIEW_ANSWER_SECONDS * 1000;

export class AppViewBroker {
  private readonly pending = new PendingAnswers<AppViewOutcome>('app view request');

  constructor(
    private readonly deliver: AppViewDelivery,
    private readonly log: Logger,
  ) {}

  async ask(clientId: string, ask: AppViewAsk): Promise<AppViewOutcome> {
    const request: AppViewRequest = { ...ask, requestId: randomUUID() };
    const delivered = await this.deliver(clientId, { type: 'app_view', request });
    this.log.info('app_view.sent', { clientId, action: ask.action, delivered });
    if (delivered === 0) {
      return { kind: 'not_reached' };
    }
    return this.pending.wait({
      requestId: request.requestId,
      clients: [clientId],
      timeoutMs: APP_VIEW_ANSWER_MS,
      unanswered: () => {
        this.log.warn('app_view.unanswered', { clientId, action: ask.action });
        return { kind: 'unanswered' };
      },
    });
  }

  answer(clientId: string, requestId: string, result: AppViewResult): void {
    this.pending.answer(clientId, requestId, { kind: 'answered', result });
    this.log.info('app_view.answered', { clientId, ok: result.ok });
  }

  stop(): void {
    this.pending.stop({ kind: 'unanswered' });
  }
}
