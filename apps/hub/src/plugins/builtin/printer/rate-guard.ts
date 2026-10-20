import type { Logger } from '@smarteverything/logging';

export interface Cap {
  readonly perMinute: number;
  readonly burst: number;
}

export const CAPS = {
  problem: { perMinute: 12, burst: 6 },
  alert: { perMinute: 6, burst: 3 },
  supply: { perMinute: 2, burst: 2 },
  progress: { perMinute: 30, burst: 10 },
  job: { perMinute: 30, burst: 10 },
  presence: { perMinute: 6, burst: 3 },
  config: { perMinute: 6, burst: 3 },
  pairing: { perMinute: 2, burst: 1 },
  write: { perMinute: 30, burst: 10 },
  identify: { perMinute: 6, burst: 3 },
  cancelAll: { perMinute: 6, burst: 3 },
  notification: { perMinute: 120, burst: 50 },
  request: { perMinute: 20, burst: 5 },
} as const satisfies Record<string, Cap>;

export type CapName = keyof typeof CAPS;

const STORM_LOG_MS = 60_000;

interface Bucket {
  tokens: number;
  at: number;
  dropped: number;
  loggedAt: number;
}

export class RateGuard {
  readonly #buckets = new Map<string, Bucket>();

  constructor(
    private readonly log: Logger,
    private readonly now: () => number = Date.now,
  ) {}

  allow(name: CapName, subject = ''): boolean {
    const cap: Cap = CAPS[name];
    const key = `${name}:${subject}`;
    const now = this.now();
    const bucket = this.#buckets.get(key) ?? {
      tokens: cap.burst,
      at: now,
      dropped: 0,
      loggedAt: 0,
    };
    const refilled = Math.min(
      cap.burst,
      bucket.tokens + ((now - bucket.at) / 60_000) * cap.perMinute,
    );
    bucket.at = now;
    this.#buckets.set(key, bucket);
    if (refilled >= 1) {
      bucket.tokens = refilled - 1;
      return true;
    }
    bucket.tokens = refilled;
    bucket.dropped += 1;
    if (now - bucket.loggedAt >= STORM_LOG_MS) {
      bucket.loggedAt = now;
      this.log.warn('printer.storm', { cap: name, dropped: bucket.dropped });
    }
    return false;
  }
}
