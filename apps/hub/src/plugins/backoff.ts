const FIRST_MS = 1_000;
const LONGEST_MS = 5 * 60_000;
const STABLE_MS = 60_000;
const JITTER_SPAN = 0.2;

export interface BackoffShape {
  readonly firstMs: number;
  readonly longestMs: number;
  readonly jitter?: () => number;
}

export function backoffDelay(failures: number, shape: BackoffShape): number {
  const base = Math.min(shape.firstMs * 2 ** failures, shape.longestMs);
  if (shape.jitter === undefined) {
    return base;
  }
  return Math.round(base * (1 + (shape.jitter() - 0.5) * JITTER_SPAN));
}

export class Backoff {
  private failures = 0;
  private startedAt = 0;

  constructor(private readonly longestMs: number = LONGEST_MS) {}

  started(now: number): void {
    this.startedAt = now;
  }

  nextDelay(now: number): number {
    if (now - this.startedAt >= STABLE_MS) {
      this.failures = 0;
    }
    const delay = backoffDelay(this.failures, { firstMs: FIRST_MS, longestMs: this.longestMs });
    this.failures += 1;
    return delay;
  }

  reset(): void {
    this.failures = 0;
  }
}
