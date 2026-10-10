const MILLISECONDS = 1000;

export interface IdleTimerOptions {
  readonly seconds: () => number;
  readonly busy: () => boolean;
  readonly expired: () => void;
}

export class IdleTimer {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly options: IdleTimerOptions) {}

  restart(): void {
    this.clear();
    const timer = setTimeout(() => {
      this.timer = null;
      if (this.options.busy()) {
        this.restart();
      } else {
        this.options.expired();
      }
    }, this.options.seconds() * MILLISECONDS);
    timer.unref();
    this.timer = timer;
  }

  clear(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
