import { Throttle } from './throttle';

export class StepFeed {
  private latest: string | null = null;
  private sent: string | null = null;
  private readonly throttle: Throttle;

  constructor(
    private readonly send: (step: string) => void,
    now: () => number,
    gapMs: number,
  ) {
    this.throttle = new Throttle(
      () => {
        this.flush();
      },
      gapMs,
      now,
    );
  }

  push(step: string): void {
    this.latest = step;
    this.throttle.trigger();
  }

  stop(): void {
    this.throttle.cancel();
  }

  private flush(): void {
    if (this.latest === null || this.latest === this.sent) {
      return;
    }
    this.sent = this.latest;
    this.send(this.latest);
  }
}
