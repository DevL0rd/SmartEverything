import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Bucket, BucketRate } from '../../src/state/budgets';
import { admit, PARK_LIMIT_MS, refilled } from '../../src/state/budgets';

const rates: fc.Arbitrary<BucketRate> = fc.record({
  burst: fc.integer({ min: 1, max: 600 }),
  perMinute: fc.integer({ min: 1, max: 600 }),
});

const times = fc.integer({ min: 0, max: 10_000_000 });

const buckets = (rate: BucketRate): fc.Arbitrary<Bucket> =>
  fc.record({
    tokens: fc.double({ min: 0, max: rate.burst, noNaN: true }),
    at: times,
  });

describe('token bucket properties', () => {
  it('never hold more than the burst or less than nothing', () => {
    fc.assert(
      fc.property(
        rates.chain((rate) => fc.tuple(fc.constant(rate), buckets(rate), times)),
        ([rate, bucket, now]) => {
          const next = refilled(bucket, rate, now);
          expect(next.tokens).toBeGreaterThanOrEqual(0);
          expect(next.tokens).toBeLessThanOrEqual(rate.burst);
        },
      ),
    );
  });

  it('let a wait end in a go at the instant it names', () => {
    fc.assert(
      fc.property(
        rates.chain((rate) => fc.tuple(fc.constant(rate), buckets(rate), times)),
        ([rate, bucket, asked]) => {
          const now = Math.max(asked, bucket.at);
          const first = admit([{ bucket, rate }], now, now);
          if (first.kind !== 'wait') return;
          expect(first.until).toBeLessThanOrEqual(now + PARK_LIMIT_MS);
          const second = admit([{ bucket: first.buckets[0] ?? bucket, rate }], first.until, now);
          expect(second.kind).toBe('go');
        },
      ),
    );
  });

  it('never let more than the burst through at one instant', () => {
    fc.assert(
      fc.property(rates, times, (rate, now) => {
        let bucket: Bucket = { tokens: rate.burst, at: now };
        let granted = 0;
        for (let ask = 0; ask < rate.burst + 5; ask += 1) {
          const verdict = admit([{ bucket, rate }], now, now);
          bucket = verdict.buckets[0] ?? bucket;
          if (verdict.kind === 'go') granted += 1;
        }
        expect(granted).toBe(rate.burst);
      }),
    );
  });
});
