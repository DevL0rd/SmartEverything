import { randomUUID } from 'node:crypto';
import type {
  WatchActionNotice,
  WatchActionRequest,
  WatchActionResult,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { PendingAnswers } from './pending-answers';

export type ActionSender = (notice: WatchActionNotice, profileId: string) => string[];

export interface WatchActionTarget {
  readonly deviceId: string;
  readonly profileId: string;
  readonly name: string;
}

export const ANSWER_TIMEOUT_MS = 25_000;

export class WatchActionBroker {
  private readonly answers = new PendingAnswers<WatchActionResult>('watch action');

  constructor(
    private readonly send: ActionSender,
    private readonly log: Logger,
  ) {}

  run(
    target: WatchActionTarget,
    action: WatchActionRequest,
    by: string,
  ): Promise<WatchActionResult> {
    const requestId = randomUUID();
    const clients = this.send(
      { type: 'watch_action', requestId, deviceId: target.deviceId, action },
      target.profileId,
    );
    this.log.info('watch.action_sent', {
      device: target.deviceId,
      action: action.type,
      by,
      phones: clients.length,
    });
    if (clients.length === 0) {
      return Promise.resolve({
        ok: false,
        detail: `No phone of ${target.name}’s person is online with SmartEverything open or in the background.`,
      });
    }
    return this.answers.wait({
      requestId,
      clients,
      timeoutMs: ANSWER_TIMEOUT_MS,
      unanswered: () => {
        this.log.warn('watch.action_unanswered', { device: target.deviceId, action: action.type });
        return {
          ok: false,
          detail: `The phone did not answer within ${String(ANSWER_TIMEOUT_MS / 1000)} s.`,
        };
      },
    });
  }

  answer(clientId: string, requestId: string, result: WatchActionResult): void {
    this.answers.answer(clientId, requestId, result);
    this.log.info('watch.action_answered', { by: clientId, ok: result.ok, detail: result.detail });
  }

  stop(): void {
    this.answers.stop({ ok: false, detail: 'The hub is stopping.' });
  }
}
