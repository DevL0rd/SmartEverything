import type { Logger } from '@smarteverything/logging';

const DEFAULT_WINDOW_MS = 30_000;

export interface CountSummaryOptions {
  readonly context?: Readonly<Record<string, unknown>>;
  readonly windowMs?: number;
  readonly now?: () => number;
}

export class CountSummary {
  private counts = new Map<string, number>();
  private windowStart: number;

  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(
    private readonly log: Logger,
    private readonly event: string,
    private readonly options: CountSummaryOptions = {},
  ) {
    this.windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    this.now = options.now ?? Date.now;
    this.windowStart = this.now();
  }

  count(key: string, amount = 1): void {
    this.counts.set(key, (this.counts.get(key) ?? 0) + amount);
    const at = this.now();
    if (at - this.windowStart >= this.windowMs) {
      this.flush(at);
    }
  }

  private flush(at: number): void {
    const counts = Object.fromEntries(this.counts);
    const windowMs = at - this.windowStart;
    this.counts = new Map();
    this.windowStart = at;
    this.log.debug(this.event, { ...this.options.context, windowMs, counts });
  }
}
