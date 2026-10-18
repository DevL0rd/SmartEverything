import { type WatchActionRequest, type WatchActionResult } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { PushCommandChannel, PushCommandOutcome } from '../extensions/push/commands';
import { clientsOf, type PresenceStore } from '../reach/presence';
import type { Store } from '../store/store';
import { ANSWER_TIMEOUT_MS } from './pending-answers';
import { PushAsks } from './push-asks';

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
  private readonly asks: PushAsks<WatchActionResult>;

  constructor(
    push: PushCommandChannel,
    private readonly store: WatchActionStore,
    private readonly log: Logger,
  ) {
    this.asks = new PushAsks('watch action', push);
  }

  run(
    target: WatchActionTarget,
    action: WatchActionRequest,
    by: string,
  ): Promise<WatchActionResult> {
    const clients = phonesOf(this.store, target.profileId, target.bridgeClientId);
    return this.asks.ask({
      command: 'watch_action',
      clients,
      payload: { deviceId: target.deviceId, action },
      sent: ({ asked, reached }) => {
        this.log.info('watch.action_sent', {
          device: target.deviceId,
          action: action.type,
          by,
          phones: asked,
          reached,
        });
      },
      unreachable: (outcomes) => ({ ok: false, detail: unreachable(target.name, outcomes) }),
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
    this.asks.answer(clientId, requestId, result);
    this.log.info('watch.action_answered', { by: clientId, ok: result.ok, detail: result.detail });
  }

  stop(): void {
    this.asks.stop({ ok: false, detail: 'The hub is stopping.' });
  }
}
