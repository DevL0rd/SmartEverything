const RECONNECT_DELAYS_MS = [500, 1000, 2000, 4000] as const;

const LAST_DELAY_MS = 4000;

const RECONNECT_WINDOW_MS = 20_000;

export class Reconnect {
  private attempts = 0;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private deadline: ReturnType<typeof setTimeout> | null = null;
  private waiting = false;

  constructor(
    private readonly attempt: () => void,
    private readonly giveUp: () => void,
  ) {}

  get running(): boolean {
    return this.deadline !== null;
  }

  begin(): void {
    this.cancel();
    this.deadline = setTimeout(() => {
      this.cancel();
      this.giveUp();
    }, RECONNECT_WINDOW_MS);
    window.addEventListener('online', this.online);
    this.schedule();
  }

  failed(): void {
    if (this.running) {
      this.schedule();
    }
  }

  cancel(): void {
    window.removeEventListener('online', this.online);
    this.clearRetry();
    if (this.deadline !== null) {
      clearTimeout(this.deadline);
      this.deadline = null;
    }
    this.attempts = 0;
    this.waiting = false;
  }

  private readonly online = (): void => {
    if (this.running && this.waiting) {
      this.clearRetry();
      this.fire();
    }
  };

  private schedule(): void {
    this.waiting = true;
    const delay = RECONNECT_DELAYS_MS[this.attempts] ?? LAST_DELAY_MS;
    this.attempts += 1;
    this.retry = setTimeout(() => {
      this.retry = null;
      this.fire();
    }, delay);
  }

  private fire(): void {
    this.waiting = false;
    this.attempt();
  }

  private clearRetry(): void {
    if (this.retry !== null) {
      clearTimeout(this.retry);
      this.retry = null;
    }
  }
}
