import type { Logger } from '@smarteverything/logging';

export type IngestOutcome = 'changed' | 'refreshed' | 'stale' | 'unchanged' | 'unknown';

type Counts = Record<IngestOutcome, number>;

const WINDOW_MS = 30_000;

function emptyCounts(): Counts {
  return { changed: 0, refreshed: 0, stale: 0, unchanged: 0, unknown: 0 };
}

export class IngestTally {
  private readonly byProvider = new Map<string, Counts>();
  private windowStart: number;

  constructor(
    private readonly log: Logger,
    private readonly event: string,
    private readonly now: () => number = Date.now,
  ) {
    this.windowStart = now();
  }

  count(provider: string, outcome: IngestOutcome): void {
    let counts = this.byProvider.get(provider);
    if (counts === undefined) {
      counts = emptyCounts();
      this.byProvider.set(provider, counts);
    }
    counts[outcome] += 1;
    const at = this.now();
    if (at - this.windowStart >= WINDOW_MS) {
      this.flush(at);
    }
  }

  private flush(at: number): void {
    const windowMs = at - this.windowStart;
    this.windowStart = at;
    for (const [provider, counts] of this.byProvider) {
      const total =
        counts.changed + counts.refreshed + counts.stale + counts.unchanged + counts.unknown;
      this.log.debug(this.event, {
        provider,
        windowMs,
        total,
        perSecond: Math.round((total * 10_000) / windowMs) / 10,
        ...counts,
      });
    }
    this.byProvider.clear();
  }
}
