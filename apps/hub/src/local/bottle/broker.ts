import {
  JSON_VALUE,
  type BottleActionResult,
  type BottlePushAction,
  type BottleSyncPlan,
  type BottleUvStart,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { PushCommandChannel } from '../../extensions/push/commands';
import { ANSWER_TIMEOUT_MS } from '../pending-answers';
import { PushAsks } from '../push-asks';

interface BottleTarget {
  readonly clientIds: readonly string[];
  readonly deviceId: string;
  readonly name: string;
}

interface BottleRequest {
  readonly action: BottlePushAction;
  readonly plan: BottleSyncPlan;
  readonly uvMode: BottleUvStart | null;
}

export class BottleActionBroker {
  private readonly asks: PushAsks<BottleActionResult>;
  private readonly running = new Set<string>();

  constructor(
    push: PushCommandChannel,
    private readonly log: Logger,
  ) {
    this.asks = new PushAsks('bottle action', push);
  }

  isRunning(deviceId: string): boolean {
    return this.running.has(deviceId);
  }

  async run(target: BottleTarget, request: BottleRequest): Promise<BottleActionResult> {
    this.running.add(target.deviceId);
    try {
      return await this.ask(target, request);
    } finally {
      this.running.delete(target.deviceId);
    }
  }

  private ask(target: BottleTarget, request: BottleRequest): Promise<BottleActionResult> {
    return this.asks.ask({
      command: 'bottle_action',
      clients: target.clientIds,
      payload: {
        deviceId: target.deviceId,
        action: request.action,
        uvMode: request.uvMode,
        plan: JSON_VALUE.parse(request.plan),
      },
      sent: ({ asked, reached }) => {
        this.log.info('bottle.action_sent', {
          device: target.deviceId,
          action: request.action,
          phones: asked,
          reached,
        });
      },
      unreachable: (outcomes) => ({
        ok: false,
        detail: `No phone could be reached to ask ${target.name}: ${outcomes
          .flatMap((outcome) => (outcome.outcome === 'sent' ? [] : [outcome.reason]))
          .join('; ')}`,
      }),
      unanswered: () => {
        this.log.warn('bottle.action_unanswered', {
          device: target.deviceId,
          action: request.action,
        });
        return {
          ok: false,
          detail: `The phone did not answer within ${String(ANSWER_TIMEOUT_MS / 1000)} seconds; it may be off or without internet.`,
        };
      },
    });
  }

  answer(clientId: string, requestId: string, result: BottleActionResult): void {
    this.asks.answer(clientId, requestId, result);
    this.log.info('bottle.action_answered', { by: clientId, ok: result.ok, detail: result.detail });
  }

  stop(): void {
    this.asks.stop({ ok: false, detail: 'The hub is stopping.' });
  }
}
