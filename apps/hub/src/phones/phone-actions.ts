import type {
  PhoneActionOrigin,
  PhoneActionResult,
  PhonePushedAction,
  PhoneRunAction,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { PushCommandChannel } from '../extensions/push/commands';
import { ANSWER_TIMEOUT_MS } from '../local/pending-answers';
import { PushAsks, type PushAsk } from '../local/push-asks';

export const LIVE_LEASE_MS = 10 * 60 * 1000;

const VIEWERS: PhoneActionOrigin = { source: 'app', client: null };

const REPORTED_SETTINGS: ReadonlySet<string> = new Set([
  'set_volume',
  'set_brightness',
  'set_auto_brightness',
  'set_timeout',
  'set_system_toggle',
  'set_ringer',
  'set_dnd',
]);

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
    if (REPORTED_SETTINGS.has(action.type)) {
      return this.send(target, action, origin);
    }
    return this.ask(target, action, origin);
  }

  live(target: PhoneActionTarget, on: boolean): Promise<PhoneActionResult> {
    return this.ask(target, { type: 'live', on }, VIEWERS, on ? LIVE_LEASE_MS : undefined);
  }

  private async send(
    target: PhoneActionTarget,
    action: PhonePushedAction,
    origin: PhoneActionOrigin,
  ): Promise<PhoneActionResult> {
    const dispatched = await this.asks.dispatch(this.request(target, action, origin), (result) => {
      if (!result.ok) {
        this.log.warn('phone.action_failed', {
          client: target.clientId,
          action: action.type,
          detail: result.detail,
        });
      }
    });
    return dispatched.reached ? { ok: true, detail: `Sent to ${target.name}.` } : dispatched.result;
  }

  private ask(
    target: PhoneActionTarget,
    action: PhonePushedAction,
    origin: PhoneActionOrigin,
    timeoutMs?: number,
  ): Promise<PhoneActionResult> {
    return this.asks.ask(this.request(target, action, origin, timeoutMs));
  }

  private request(
    target: PhoneActionTarget,
    action: PhonePushedAction,
    origin: PhoneActionOrigin,
    timeoutMs?: number,
  ): PushAsk<PhoneActionResult> {
    const waitMs = timeoutMs ?? ANSWER_TIMEOUT_MS;
    return {
      command: 'phone_action',
      clients: [target.clientId],
      payload: { action, origin },
      timeoutMs: waitMs,
      sent: ({ reached }): void => {
        this.log.info('phone.action_sent', {
          client: target.clientId,
          action: action.type,
          source: origin.source,
          reached,
        });
      },
      unreachable: (outcomes): PhoneActionResult => ({
        ok: false,
        detail: `${target.name} could not be reached: ${outcomes.flatMap((outcome) => (outcome.outcome === 'sent' ? [] : [outcome.reason])).join('; ')}`,
      }),
      unanswered: (): PhoneActionResult => {
        this.log.warn('phone.action_unanswered', { client: target.clientId, action: action.type });
        return {
          ok: false,
          detail: `${target.name} did not answer within ${String(waitMs / 1000)} s; it may be off or without internet.`,
        };
      },
    };
  }

  answer(clientId: string, requestId: string, result: PhoneActionResult): void {
    this.asks.answer(clientId, requestId, result);
    this.log.info('phone.action_answered', { by: clientId, ok: result.ok, detail: result.detail });
  }

  stop(): void {
    this.asks.stop({ ok: false, detail: 'The server is stopping.' });
  }
}
