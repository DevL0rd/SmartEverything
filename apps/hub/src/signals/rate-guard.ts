import {
  SIGNAL_RATES,
  signalRateKey,
  signalRateOf,
  type SignalInput,
  type SignalKindSpec,
  type SignalRateLine,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';

export type GuardVerdict = 'pass' | 'duplicate' | 'cap' | 'global' | 'uncapped';

export const GLOBAL_SIGNALS_PER_SECOND = 500;

export const OCCURRENCE_WINDOW_MS = 60_000;

export const STORM_LOG_INTERVAL_MS = 60_000;

export const STORM_ANNOUNCE_INTERVAL_MS = 10 * 60_000;

const MINUTE_MS = 60_000;

const SECOND_MS = 1000;

export interface RateGuardOptions {
  readonly now: () => number;
  readonly log: Logger;
  readonly rates?: readonly SignalRateLine[];
}

interface Bucket {
  readonly tokens: number;
  readonly at: number;
  readonly burst: number;
  readonly perMs: number;
}

interface Drops {
  readonly pending: number;
  readonly loggedAt: number;
  readonly fields: Readonly<Record<string, string | null>>;
}

type DropLine = (fields: Readonly<Record<string, string | null>>, dropped: number) => void;

class DropLog {
  private readonly entries = new Map<string, Drops>();

  constructor(private readonly line: DropLine) {}

  note(key: string, now: number, fields: Drops['fields']): void {
    const entry = this.entries.get(key);
    if (entry === undefined || now - entry.loggedAt >= STORM_LOG_INTERVAL_MS) {
      this.line(fields, (entry?.pending ?? 0) + 1);
      this.entries.set(key, { pending: 0, loggedAt: now, fields });
      return;
    }
    this.entries.set(key, { ...entry, pending: entry.pending + 1 });
  }

  flush(now: number): void {
    for (const [key, entry] of this.entries) {
      if (now - entry.loggedAt < STORM_LOG_INTERVAL_MS) continue;
      if (entry.pending === 0) {
        this.entries.delete(key);
        continue;
      }
      this.line(entry.fields, entry.pending);
      this.entries.set(key, { ...entry, pending: 0, loggedAt: now });
    }
  }
}

function occurrenceKey(signal: SignalInput): string | null {
  const occurrence = signal.data['occurrence'];
  return typeof occurrence === 'string'
    ? [signal.source, signal.kind, signal.subject ?? '', occurrence].join('|')
    : null;
}

export class RateGuard {
  private readonly buckets = new Map<string, Bucket>();
  private readonly occurrences = new Map<string, number>();
  private readonly announced = new Map<string, number>();
  private readonly capDrops: DropLog;
  private readonly globalDrops: DropLog;
  private second = -1;
  private inSecond = 0;
  private swept = Number.NEGATIVE_INFINITY;

  constructor(private readonly options: RateGuardOptions) {
    this.capDrops = new DropLog((fields, dropped) => {
      options.log.warn('signals.storm', { ...fields, dropped });
    });
    this.globalDrops = new DropLog((_fields, dropped) => {
      options.log.warn('signals.storm_global', { limit: GLOBAL_SIGNALS_PER_SECOND, dropped });
    });
  }

  admit(signal: SignalInput, kind: Pick<SignalKindSpec, 'pulse' | 'urgent'>): GuardVerdict {
    const now = this.options.now();
    this.sweep(now);
    const exceeded = this.countSecond(now);
    const occurrence = kind.pulse ? occurrenceKey(signal) : null;
    if (occurrence !== null && this.seenRecently(occurrence, now)) return 'duplicate';
    if (exceeded && kind.pulse && kind.urgent !== true) {
      this.globalDrops.note('global', now, {});
      return 'global';
    }
    const verdict = this.takeToken(signal, now);
    if (verdict === 'pass' && occurrence !== null) this.occurrences.set(occurrence, now);
    return verdict;
  }

  announceDue(source: string): boolean {
    const now = this.options.now();
    const last = this.announced.get(source);
    if (last !== undefined && now - last < STORM_ANNOUNCE_INTERVAL_MS) return false;
    this.announced.set(source, now);
    return true;
  }

  private countSecond(now: number): boolean {
    const second = Math.floor(now / SECOND_MS);
    if (second !== this.second) {
      this.second = second;
      this.inSecond = 0;
    }
    this.inSecond += 1;
    return this.inSecond > GLOBAL_SIGNALS_PER_SECOND;
  }

  private seenRecently(key: string, now: number): boolean {
    const seen = this.occurrences.get(key);
    return seen !== undefined && now - seen < OCCURRENCE_WINDOW_MS;
  }

  refillAt(signal: SignalInput): number {
    const rate = this.rateOf(signal);
    const bucket = rate === null ? undefined : this.buckets.get(signalRateKey(rate, signal));
    const now = this.options.now();
    return bucket === undefined ? now : now + Math.ceil((1 - bucket.tokens) / bucket.perMs);
  }

  private rateOf(signal: SignalInput): SignalRateLine | null {
    return signalRateOf(signal.source, signal.kind, this.options.rates ?? SIGNAL_RATES);
  }

  private takeToken(signal: SignalInput, now: number): GuardVerdict {
    const rate = this.rateOf(signal);
    if (rate === null) {
      this.options.log.error('signals.uncapped', new Error('Signal kind has no rate cap'), {
        source: signal.source,
        kind: signal.kind,
      });
      return 'uncapped';
    }
    const key = signalRateKey(rate, signal);
    const perMs = rate.perMinute / MINUTE_MS;
    const before = this.buckets.get(key) ?? {
      tokens: rate.burst,
      at: now,
      burst: rate.burst,
      perMs,
    };
    const tokens =
      now < before.at
        ? before.burst
        : Math.min(before.burst, before.tokens + (now - before.at) * before.perMs);
    const taken = tokens >= 1;
    this.buckets.set(key, {
      ...before,
      tokens: taken ? tokens - 1 : tokens,
      at: now,
    });
    if (taken) return 'pass';
    this.capDrops.note(key, now, {
      source: signal.source,
      kind: rate.per.includes('kind') ? signal.kind : null,
      subject: rate.per.includes('subject') ? signal.subject : null,
      field: rate.per.includes('field') ? signal.field : null,
    });
    return 'cap';
  }

  private sweep(now: number): void {
    if (now - this.swept < MINUTE_MS) return;
    this.swept = now;
    for (const [key, bucket] of this.buckets) {
      if (bucket.tokens + (now - bucket.at) * bucket.perMs >= bucket.burst)
        this.buckets.delete(key);
    }
    for (const [key, seen] of this.occurrences) {
      if (now - seen >= OCCURRENCE_WINDOW_MS) this.occurrences.delete(key);
    }
    this.capDrops.flush(now);
    this.globalDrops.flush(now);
  }
}
