export class Coalesced {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly work: () => void,
    private readonly delayMs: number,
  ) {}

  trigger(): void {
    if (this.timer !== null) {
      return;
    }
    const timer = setTimeout(() => {
      this.timer = null;
      this.work();
    }, this.delayMs);
    timer.unref();
    this.timer = timer;
  }

  cancel(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
