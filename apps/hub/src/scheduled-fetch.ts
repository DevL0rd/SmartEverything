import type { Cancel, Clock } from './clock';
import { background } from '@smarteverything/logging';

export interface ScheduledFetchOptions<Row> {
  readonly clock: Clock;
  readonly fetch: () => Promise<Row>;
  readonly retrySeconds: readonly number[];
  readonly minGapMs: number;
}

export interface Freshness {
  readonly fetchedAt: string | null;
  readonly healthy: boolean;
}

export class ScheduledFetch<Row> {
  private timer: Cancel | null = null;
  private running: Promise<Row> | null = null;
  private failures = 0;
  private readonly longestRetrySeconds: number;

  constructor(private readonly options: ScheduledFetchOptions<Row>) {
    this.longestRetrySeconds = Math.max(...options.retrySeconds);
  }

  run(): Promise<Row> {
    if (this.running !== null) {
      return this.running;
    }
    const running = this.options.fetch().finally(() => {
      this.running = null;
    });
    this.running = running;
    return running;
  }

  refresh(current: Row, freshness: Freshness): Promise<Row> {
    if (this.running !== null) {
      return this.running;
    }
    const age =
      freshness.fetchedAt === null
        ? Number.POSITIVE_INFINITY
        : this.options.clock.now().getTime() - Date.parse(freshness.fetchedAt);
    return freshness.healthy && age < this.options.minGapMs ? Promise.resolve(current) : this.run();
  }

  settled(): Promise<Row> | null {
    return this.running;
  }

  schedule(at: Date): void {
    this.cancel();
    this.timer = this.options.clock.at(at, () => {
      this.timer = null;
      background(this.run(), 'scheduled_fetch.run_failed');
    });
  }

  cancel(): void {
    this.timer?.();
    this.timer = null;
  }

  reset(): void {
    this.failures = 0;
  }

  retryAt(): Date {
    const seconds = this.options.retrySeconds[this.failures] ?? this.longestRetrySeconds;
    this.failures += 1;
    return new Date(this.options.clock.now().getTime() + seconds * 1000);
  }
}
