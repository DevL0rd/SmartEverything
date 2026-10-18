import type {
  PhoneActionOrigin,
  PhoneActionResult,
  PhonePushedAction,
  PhoneRunAction,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { PushCommandChannel } from '../extensions/push/commands';
import { ANSWER_TIMEOUT_MS } from '../local/pending-answers';
import { PushAsks } from '../local/push-asks';

export const LIVE_LEASE_MS = 10 * 60 * 1000;

const VIEWERS: PhoneActionOrigin = { source: 'app', client: null };

export interface PhoneActionTarget {
  readonly clientId: string;
  readonly name: string;
}

export class PhoneActionBroker {
  private readonly asks: PushAsks<PhoneActionResult>;

  constructor(
    push: PushCommandChannel,
    private readonly log: Logger,
  ) {
    this.asks = new PushAsks('phone action', push);
  }

  run(
    target: PhoneActionTarget,
    action: PhoneRunAction,
    origin: PhoneActionOrigin,
  ): Promise<PhoneActionResult> {
    return this.ask(target, action, origin);
  }

  live(target: PhoneActionTarget, on: boolean): Promise<PhoneActionResult> {
    return this.ask(target, { type: 'live', on }, VIEWERS, on ? LIVE_LEASE_MS : undefined);
  }

  private ask(
    target: PhoneActionTarget,
    action: PhonePushedAction,
    origin: PhoneActionOrigin,
    timeoutMs?: number,
  ): Promise<PhoneActionResult> {
    const waitMs = timeoutMs ?? ANSWER_TIMEOUT_MS;
    return this.asks.ask({
      command: 'phone_action',
      clients: [target.clientId],
      payload: { action, origin },
      timeoutMs: waitMs,
      sent: ({ reached }) => {
        this.log.info('phone.action_sent', {
          client: target.clientId,
          action: action.type,
          source: origin.source,
          reached,
        });
      },
      unreachable: (outcomes) => ({
        ok: false,
        detail: `${target.name} could not be reached: ${outcomes.flatMap((outcome) => (outcome.outcome === 'sent' ? [] : [outcome.reason])).join('; ')}`,
      }),
      unanswered: () => {
        this.log.warn('phone.action_unanswered', { client: target.clientId, action: action.type });
        return {
          ok: false,
          detail: `${target.name} did not answer within ${String(waitMs / 1000)} s; it may be off or without internet.`,
        };
      },
    });
  }

  answer(clientId: string, requestId: string, result: PhoneActionResult): void {
    this.asks.answer(clientId, requestId, result);
    this.log.info('phone.action_answered', { by: clientId, ok: result.ok, detail: result.detail });
  }

  stop(): void {
    this.asks.stop({ ok: false, detail: 'The server is stopping.' });
  }
}
