import type { TreadmillActionResult, TreadmillWriteStep } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { PushCommandChannel } from '../../extensions/push/commands';
import { ANSWER_TIMEOUT_MS } from '../pending-answers';
import { PushAsks } from '../push-asks';

export interface TreadmillTarget {
  readonly clientId: string;
  readonly deviceId: string;
  readonly name: string;
}

export class TreadmillActionBroker {
  private readonly asks: PushAsks<TreadmillActionResult>;

  constructor(
    push: PushCommandChannel,
    private readonly log: Logger,
  ) {
    this.asks = new PushAsks('treadmill command', push);
  }

  run(
    target: TreadmillTarget,
    steps: readonly TreadmillWriteStep[],
  ): Promise<TreadmillActionResult> {
    return this.asks.ask({
      command: 'treadmill_action',
      clients: [target.clientId],
      payload: { deviceId: target.deviceId, steps: steps.map((step) => ({ ...step })) },
      sent: ({ asked, reached }) => {
        this.log.info('treadmill.command_sent', {
          device: target.deviceId,
          phones: asked,
          reached,
          writes: steps.length,
        });
      },
      unreachable: (outcomes) => ({
        ok: false,
        detail: `The phone holding ${target.name} could not be reached: ${outcomes.flatMap((outcome) => (outcome.outcome === 'sent' ? [] : [outcome.reason])).join('; ')}`,
      }),
      unanswered: () => {
        this.log.warn('treadmill.command_unanswered', { device: target.deviceId });
        return {
          ok: false,
          detail: `The phone holding ${target.name} did not answer within ${String(ANSWER_TIMEOUT_MS / 1000)} seconds; it may be off or without internet.`,
        };
      },
    });
  }

  answer(clientId: string, requestId: string, result: TreadmillActionResult): void {
    this.asks.answer(clientId, requestId, result);
    this.log.info('treadmill.command_answered', {
      by: clientId,
      ok: result.ok,
      detail: result.detail,
    });
  }

  stop(): void {
    this.asks.stop({ ok: false, detail: 'The hub is stopping.' });
  }
}
