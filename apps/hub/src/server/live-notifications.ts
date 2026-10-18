import type { LiveNotificationNotice, PhoneActionResult } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { PendingAnswers } from '../local/pending-answers';

export const NOTIFICATION_SHOWN_MS = 5000;

export type NoticeDelivery = (clientId: string, notice: LiveNotificationNotice) => Promise<number>;

export class LiveNotifications {
  private readonly shown = new PendingAnswers<PhoneActionResult>('notification');

  constructor(
    private readonly deliver: NoticeDelivery,
    private readonly log: Logger,
  ) {}

  async show(clientId: string, notice: LiveNotificationNotice): Promise<boolean> {
    if ((await this.deliver(clientId, notice)) === 0) {
      return false;
    }
    const answer = await this.shown.wait({
      requestId: notice.requestId,
      clients: [clientId],
      timeoutMs: NOTIFICATION_SHOWN_MS,
      unanswered: () => ({
        ok: false,
        detail: `The phone did not confirm the notification within ${String(NOTIFICATION_SHOWN_MS / 1000)} s`,
      }),
    });
    if (!answer.ok) {
      this.log.warn('live.notification_not_shown', {
        clientId,
        notificationId: notice.id,
        reason: answer.detail,
      });
    }
    return answer.ok;
  }

  has(requestId: string): boolean {
    return this.shown.has(requestId);
  }

  answer(clientId: string, requestId: string, result: PhoneActionResult): void {
    this.shown.answer(clientId, requestId, result);
  }

  stop(): void {
    this.shown.stop({ ok: false, detail: 'The server is stopping.' });
  }
}
