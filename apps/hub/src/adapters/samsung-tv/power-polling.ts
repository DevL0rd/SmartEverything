import type { Logger } from '@smarteverything/logging';

const POWER_POLL_MS = 5000;

export type PowerProbe = () => Promise<boolean>;

export class PowerStatePolling {
  private timer: NodeJS.Timeout | null = null;
  private last: boolean | null = null;
  private stopped = true;

  constructor(
    private readonly probe: PowerProbe,
    private readonly onChange: (on: boolean) => void,
    private readonly log: Logger,
  ) {}

  get known(): boolean | null {
    return this.last;
  }

  start(): void {
    this.stopped = false;
    this.log.info('power.polling_started', {
      everyMs: POWER_POLL_MS,
      reason: 'the TV pushes nothing about its power state while it is off',
    });
    void this.tick();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  async checkNow(): Promise<boolean> {
    const on = await this.probe();
    if (on !== this.last) {
      this.last = on;
      this.onChange(on);
    }
    return on;
  }

  private async tick(): Promise<void> {
    try {
      await this.checkNow();
    } catch (cause) {
      this.log.warn('power.poll_failed', { reason: String(cause) });
    }
    if (!this.stopped) {
      this.timer = setTimeout(() => {
        void this.tick();
      }, POWER_POLL_MS);
    }
  }
}
