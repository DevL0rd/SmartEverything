const PULSE_MS = 8000;
const LIMIT_MS = 10 * 60_000;

interface Active {
  readonly since: number;
  readonly pulse: () => Promise<void>;
}

export class Typing {
  private readonly active = new Map<string, Active>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly now: () => number,
    private readonly report: (cause: unknown) => void,
  ) {}

  start(eventId: string, pulse: () => Promise<void>): void {
    this.active.set(eventId, { since: this.now(), pulse });
    this.timer ??= setInterval(() => {
      this.pulseAll().catch((cause: unknown) => {
        this.report(cause);
      });
    }, PULSE_MS);
    this.timer.unref();
    this.pulseOne(eventId).catch((cause: unknown) => {
      this.report(cause);
    });
  }

  stop(eventId: string): void {
    this.active.delete(eventId);
    this.idle();
  }

  close(): void {
    this.active.clear();
    this.idle();
  }

  private async pulseAll(): Promise<void> {
    for (const eventId of [...this.active.keys()]) {
      await this.pulseOne(eventId);
    }
    this.idle();
  }

  private async pulseOne(eventId: string): Promise<void> {
    const entry = this.active.get(eventId);
    if (entry === undefined) {
      return;
    }
    if (this.now() - entry.since > LIMIT_MS) {
      this.active.delete(eventId);
      return;
    }
    try {
      await entry.pulse();
    } catch (cause) {
      this.active.delete(eventId);
      this.report(cause);
    }
  }

  private idle(): void {
    if (this.active.size === 0 && this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
