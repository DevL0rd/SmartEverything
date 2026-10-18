import { describe, expect, it } from 'vitest';
import { Backoff, backoffDelay } from '../../src/plugins/backoff';

function delays(backoff: Backoff, count: number): number[] {
  return Array.from({ length: count }, () => backoff.nextDelay(0));
}

describe('Backoff', () => {
  it('doubles from one second up to five minutes by default', () => {
    expect(delays(new Backoff(), 11)).toEqual([
      1000, 2000, 4000, 8000, 16000, 32000, 64000, 128000, 256000, 300000, 300000,
    ]);
  });

  it('stops growing at the longest delay it was given', () => {
    expect(delays(new Backoff(30_000), 8)).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000,
    ]);
  });

  it('starts over after a connection that stayed up for a minute', () => {
    const backoff = new Backoff(30_000);
    backoff.started(0);
    delays(backoff, 4);
    expect(backoff.nextDelay(59_999)).toBe(16_000);
    backoff.started(100_000);
    expect(backoff.nextDelay(160_000)).toBe(1000);
  });
});

describe('backoffDelay', () => {
  it('doubles from the first delay to the longest', () => {
    const shape = { firstMs: 500, longestMs: 4_000 };
    expect([0, 1, 2, 3, 4, 10].map((failures) => backoffDelay(failures, shape))).toEqual([
      500, 1000, 2000, 4000, 4000, 4000,
    ]);
  });

  it('spreads the delay by up to ten percent either way', () => {
    const shape = { firstMs: 1000, longestMs: 60_000 };
    expect(backoffDelay(1, { ...shape, jitter: () => 0 })).toBe(1800);
    expect(backoffDelay(1, { ...shape, jitter: () => 0.5 })).toBe(2000);
    expect(backoffDelay(1, { ...shape, jitter: () => 1 })).toBe(2200);
  });
});
