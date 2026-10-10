const FIRST_MS = 1_000;
const LONGEST_MS = 5 * 60_000;
const STABLE_MS = 60_000;

export class Backoff {
  private failures = 0;
  private startedAt = 0;

  started(now: number): void {
    this.startedAt = now;
  }

  nextDelay(now: number): number {
    if (now - this.startedAt >= STABLE_MS) {
      this.failures = 0;
    }
    const delay = Math.min(FIRST_MS * 2 ** this.failures, LONGEST_MS);
    this.failures += 1;
    return delay;
  }

  reset(): void {
    this.failures = 0;
  }
}
