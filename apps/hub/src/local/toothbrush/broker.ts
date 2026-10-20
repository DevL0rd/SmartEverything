import type { BrushActionResult, BrushStep } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { PushCommandChannel } from '../../extensions/push/commands';
import { ANSWER_TIMEOUT_MS } from '../pending-answers';
import { PushAsks } from '../push-asks';

export interface BrushTarget {
  readonly clientId: string;
  readonly deviceId: string;
  readonly name: string;
}

export class BrushActionBroker {
  private readonly asks: PushAsks<BrushActionResult>;

  constructor(
    push: PushCommandChannel,
    private readonly log: Logger,
  ) {
    this.asks = new PushAsks('toothbrush command', push);
  }

  run(target: BrushTarget, steps: readonly BrushStep[]): Promise<BrushActionResult> {
    return this.asks.ask({
      command: 'toothbrush_action',
      clients: [target.clientId],
      payload: { deviceId: target.deviceId, steps: steps.map((step) => ({ ...step })) },
      sent: ({ asked, reached }) => {
        this.log.info('toothbrush.command_sent', {
          device: target.deviceId,
          phones: asked,
          reached,
          steps: steps.length,
        });
      },
      unreachable: (outcomes) => ({
        ok: false,
        detail: `The phone holding ${target.name} could not be reached: ${outcomes.flatMap((outcome) => (outcome.outcome === 'sent' ? [] : [outcome.reason])).join('; ')}`,
      }),
      unanswered: () => {
        this.log.warn('toothbrush.command_unanswered', { device: target.deviceId });
        return {
          ok: false,
          detail: `The phone holding ${target.name} did not answer within ${String(ANSWER_TIMEOUT_MS / 1000)} seconds; the brush may have gone to sleep.`,
        };
      },
    });
  }

  answer(clientId: string, requestId: string, result: BrushActionResult): void {
    this.asks.answer(clientId, requestId, result);
    this.log.info('toothbrush.command_answered', { by: clientId, ok: result.ok });
  }

  stop(): void {
    this.asks.stop({ ok: false, detail: 'The hub is stopping.' });
  }
}
