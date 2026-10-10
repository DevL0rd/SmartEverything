import type { Logger } from '@smarteverything/logging';
import type { XiaomiTiming } from './dependencies';

const JITTER_SPAN = 0.2;
const DOUBLING = 2;

export interface LanReconnectOptions {
  readonly did: string;
  readonly timing: Pick<XiaomiTiming, 'lanRetryFirstMs' | 'lanRetryMaxMs'>;
  readonly jitter: () => number;
  readonly log: Logger;
  readonly attempt: () => Promise<boolean>;
}

export class LanReconnect {
  private active = false;
  private busy = false;
  private again = false;
  private failures = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly options: LanReconnectOptions) {}

  arm(): void {
    if (this.active) {
      return;
    }
    this.active = true;
    this.schedule();
  }

  trigger(): void {
    if (!this.active) {
      return;
    }
    if (this.busy) {
      this.again = true;
      return;
    }
    this.clearTimer();
    void this.run();
  }

  cancel(): void {
    this.active = false;
    this.again = false;
    this.failures = 0;
    this.clearTimer();
  }

  private async run(): Promise<void> {
    this.busy = true;
    let done: boolean;
    try {
      done = await this.options.attempt();
    } finally {
      this.busy = false;
    }
    if (!this.active) {
      return;
    }
    if (done) {
      this.cancel();
      return;
    }
    this.failures += 1;
    if (this.again) {
      this.again = false;
      void this.run();
      return;
    }
    this.schedule();
  }

  private schedule(): void {
    this.clearTimer();
    const { timing, jitter, log, did } = this.options;
    const base = Math.min(timing.lanRetryFirstMs * DOUBLING ** this.failures, timing.lanRetryMaxMs);
    const delay = Math.round(base * (1 + (jitter() - 0.5) * JITTER_SPAN));
    log.debug('xiaomi_device.lan_retry_scheduled', { did, failures: this.failures, delay });
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, delay);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
