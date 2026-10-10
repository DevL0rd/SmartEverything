export class StepFeed {
  private latest: string | null = null;
  private sent: string | null = null;
  private sentAt = Number.NEGATIVE_INFINITY;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly send: (step: string) => void,
    private readonly now: () => number,
    private readonly gapMs: number,
  ) {}

  push(step: string): void {
    this.latest = step;
    if (this.timer !== null) {
      return;
    }
    const wait = this.sentAt + this.gapMs - this.now();
    if (wait <= 0) {
      this.flush();
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, wait);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private flush(): void {
    if (this.latest === null || this.latest === this.sent) {
      return;
    }
    this.sent = this.latest;
    this.sentAt = this.now();
    this.send(this.latest);
  }
}
