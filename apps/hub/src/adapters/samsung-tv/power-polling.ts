import type { Logger } from '@smarteverything/logging';
import { Loop } from '../../plugins/loop';
import { failureLine } from '@smarteverything/logging';

const POWER_POLL_MS = 5000;

export const FRESH_MS = POWER_POLL_MS;

export type PowerProbe = () => Promise<boolean>;

export class PowerStatePolling {
  private readonly loop = new Loop(
    () => this.poll(),
    () => POWER_POLL_MS,
  );
  private last: boolean | null = null;
  private checkedAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly probe: PowerProbe,
    private readonly onChange: (on: boolean) => void,
    private readonly log: Logger,
    private readonly now: () => number,
  ) {}

  start(): void {
    this.log.info('power.polling_started', {
      everyMs: POWER_POLL_MS,
      reason: 'the TV pushes nothing about its power state while it is off',
    });
    this.loop.start();
    this.loop.runNow();
  }

  stop(): void {
    this.loop.stop();
  }

  async current(): Promise<boolean> {
    if (this.last !== null && this.now() - this.checkedAt < FRESH_MS) {
      return this.last;
    }
    return this.checkNow();
  }

  async checkNow(): Promise<boolean> {
    const on = await this.probe();
    this.checkedAt = this.now();
    if (on !== this.last) {
      this.last = on;
      this.onChange(on);
    }
    return on;
  }

  private async poll(): Promise<void> {
    try {
      await this.checkNow();
    } catch (cause) {
      this.log.warn('power.poll_failed', { reason: failureLine(cause) });
    }
  }
}
