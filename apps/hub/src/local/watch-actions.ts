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

export type WatchOutcome =
  | { readonly ok: true; readonly detail: string }
  | {
      readonly ok: false;
      readonly reason: 'unreachable' | 'unanswered' | 'refused';
      readonly detail: string;
    };

export class WatchActionBroker {
  private readonly asks: PushAsks<WatchOutcome>;

  constructor(
    push: PushCommandChannel,
    private readonly store: WatchActionStore,
    private readonly log: Logger,
  ) {
    this.asks = new PushAsks('watch action', push);
  }

  async run(
    target: WatchActionTarget,
    action: WatchActionRequest,
    by: string,
  ): Promise<WatchActionResult> {
    const { ok, detail } = await this.attempt(target, action, by);
    return { ok, detail };
  }

  attempt(
    target: WatchActionTarget,
    action: WatchActionRequest,
    by: string,
  ): Promise<WatchOutcome> {
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
      unreachable: (outcomes) => ({
        ok: false,
        reason: 'unreachable',
        detail: unreachable(target.name, outcomes),
      }),
      unanswered: () => {
        this.log.warn('watch.action_unanswered', { device: target.deviceId, action: action.type });
        return {
          ok: false,
          reason: 'unanswered',
          detail: `The phone did not answer within ${String(ANSWER_TIMEOUT_MS / 1000)} s.`,
        };
      },
    });
  }

  answer(clientId: string, requestId: string, result: WatchActionResult): void {
    this.asks.answer(
      clientId,
      requestId,
      result.ok
        ? { ok: true, detail: result.detail }
        : { ok: false, reason: 'refused', detail: result.detail },
    );
    this.log.info('watch.action_answered', { by: clientId, ok: result.ok, detail: result.detail });
  }

  stop(): void {
    this.asks.stop({ ok: false, reason: 'unreachable', detail: 'The hub is stopping.' });
  }
}
