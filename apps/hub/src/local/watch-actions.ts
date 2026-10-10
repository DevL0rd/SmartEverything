import { randomUUID } from 'node:crypto';
import { type WatchActionRequest, type WatchActionResult } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { PushCommandChannel, PushCommandOutcome } from '../extensions/push/commands';
import { clientsOf, type PresenceStore } from '../reach/presence';
import type { Store } from '../store/store';
import { ANSWER_TIMEOUT_MS, PendingAnswers } from './pending-answers';

export type WatchActionStore = PresenceStore & Pick<Store, 'personal'>;

export interface WatchActionTarget {
  readonly deviceId: string;
  readonly profileId: string;
  readonly name: string;
  readonly bridgeClientId: string | null;
}

function unreachable(name: string, outcomes: readonly PushCommandOutcome[]): string {
  const reasons = outcomes.flatMap((outcome) =>
    outcome.outcome === 'sent' ? [] : [outcome.reason],
  );
  return reasons.length === 0
    ? `No phone of ${name}’s person has signed up for push messages yet; open SmartEverything on the phone once.`
    : `${name}’s phone could not be reached: ${reasons.join('; ')}`;
}

export function phonesOf(
  store: WatchActionStore,
  profileId: string,
  bridgeClientId: string | null = null,
): string[] {
  const phones = clientsOf(store, profileId)
    .filter((client) => client.platform === 'android')
    .map((client) => client.id);
  return bridgeClientId !== null && phones.includes(bridgeClientId) ? [bridgeClientId] : phones;
}

export class WatchActionBroker {
  private readonly answers = new PendingAnswers<WatchActionResult>('watch action');

  constructor(
    private readonly push: PushCommandChannel,
    private readonly store: WatchActionStore,
    private readonly log: Logger,
  ) {}

  async run(
    target: WatchActionTarget,
    action: WatchActionRequest,
    by: string,
  ): Promise<WatchActionResult> {
    const requestId = randomUUID();
    const payload = {
      requestId,
      deviceId: target.deviceId,
      action,
      expiresAt: new Date(Date.now() + ANSWER_TIMEOUT_MS).toISOString(),
    };
    const phones = phonesOf(this.store, target.profileId, target.bridgeClientId);
    const sent = await Promise.all(
      phones.map(async (clientId) => ({
        clientId,
        outcome: await this.push.send({ clientId, command: 'watch_action', payload }),
      })),
    );
    const reached = sent.filter(({ outcome }) => outcome.outcome === 'sent');
    this.log.info('watch.action_sent', {
      device: target.deviceId,
      action: action.type,
      by,
      phones: phones.length,
      reached: reached.length,
    });
    if (reached.length === 0) {
      return {
        ok: false,
        detail: unreachable(
          target.name,
          sent.map(({ outcome }) => outcome),
        ),
      };
    }
    return this.answers.wait({
      requestId,
      clients: reached.map(({ clientId }) => clientId),
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
