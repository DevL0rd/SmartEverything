import { randomUUID } from 'node:crypto';
import type { PhoneAction, PhoneActionResult } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { PushCommandChannel } from '../extensions/push/commands';
import { PendingAnswers } from '../local/pending-answers';
import { ANSWER_TIMEOUT_MS } from '../local/watch-actions';

export interface PhoneActionTarget {
  readonly clientId: string;
  readonly name: string;
}

export class PhoneActionBroker {
  private readonly answers = new PendingAnswers<PhoneActionResult>('phone action');

  constructor(
    private readonly push: PushCommandChannel,
    private readonly log: Logger,
  ) {}

  async run(target: PhoneActionTarget, action: PhoneAction, by: string): Promise<PhoneActionResult> {
    const requestId = randomUUID();
    const sent = await this.push.send({
      clientId: target.clientId,
      command: 'phone_action',
      payload: { requestId, action },
    });
    this.log.info('phone.action_sent', { client: target.clientId, action: action.type, by, outcome: sent.outcome });
    if (sent.outcome !== 'sent') {
      return { ok: false, detail: `${target.name} could not be reached: ${sent.reason}` };
    }
    return this.answers.wait({
      requestId,
      clients: [target.clientId],
      timeoutMs: ANSWER_TIMEOUT_MS,
      unanswered: () => {
        this.log.warn('phone.action_unanswered', { client: target.clientId, action: action.type });
        return {
          ok: false,
          detail: `${target.name} did not answer within ${String(ANSWER_TIMEOUT_MS / 1000)} s; it may be off or without internet.`,
        };
      },
    });
  }

  answer(clientId: string, requestId: string, result: PhoneActionResult): void {
    this.answers.answer(clientId, requestId, result);
    this.log.info('phone.action_answered', { by: clientId, ok: result.ok, detail: result.detail });
  }

  stop(): void {
    this.answers.stop({ ok: false, detail: 'The server is stopping.' });
  }
}
