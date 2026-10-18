import type { Logger } from '@smarteverything/logging';
import { backoffDelay } from '../../plugins/backoff';
import type { XiaomiTiming } from './dependencies';
import { background, failureLine } from '@smarteverything/logging';

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
    background(this.run(), 'lan_reconnect.run_failed');
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
    const startedAt = Date.now();
    try {
      done = await this.options.attempt();
    } catch (cause) {
      this.options.log.warn('xiaomi_device.lan_attempt_failed', {
        did: this.options.did,
        failures: this.failures,
        reason: failureLine(cause),
        durationMs: Date.now() - startedAt,
      });
      throw cause;
    } finally {
      this.busy = false;
    }
    this.options.log.debug('xiaomi_device.lan_attempt_finished', () => ({
      did: this.options.did,
      done,
      failures: this.failures,
      durationMs: Date.now() - startedAt,
    }));
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
      background(this.run(), 'lan_reconnect.run_failed');
      return;
    }
    this.schedule();
  }

  private schedule(): void {
    this.clearTimer();
    const { timing, jitter, log, did } = this.options;
    const delay = backoffDelay(this.failures, {
      firstMs: timing.lanRetryFirstMs,
      longestMs: timing.lanRetryMaxMs,
      jitter,
    });
    log.debug('xiaomi_device.lan_retry_scheduled', { did, failures: this.failures, delay });
    this.timer = setTimeout(() => {
      this.timer = null;
      background(this.run(), 'lan_reconnect.run_failed');
    }, delay);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
