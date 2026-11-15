import { afterPendingInput } from './guarded-socket';

export class ConnectionHeartbeat {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly periodMs: number,
    private readonly beat: () => boolean,
  ) {}

  get running(): boolean {
    return this.timer !== null;
  }

  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      afterPendingInput(() => {
        if (!this.beat()) this.stop();
      });
    }, this.periodMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}
