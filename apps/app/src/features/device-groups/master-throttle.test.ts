import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MASTER_LIVE_INTERVAL_MS, trailingThrottle } from './master-throttle';

describe('trailingThrottle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends the first live value at once and at most 8 per second after that', () => {
    const sent: number[] = [];
    const throttle = trailingThrottle((value: number) => sent.push(value));
    for (let step = 0; step < 100; step += 1) {
      throttle.push(step);
      vi.advanceTimersByTime(10);
    }
    vi.advanceTimersByTime(MASTER_LIVE_INTERVAL_MS);
    expect(sent[0]).toBe(0);
    expect(sent.length).toBeLessThanOrEqual(9);
    expect(sent.length).toBeGreaterThan(5);
  });

  it('always sends the trailing live value', () => {
    const sent: number[] = [];
    const throttle = trailingThrottle((value: number) => sent.push(value));
    throttle.push(10);
    throttle.push(20);
    throttle.push(30);
    expect(sent).toEqual([10]);
    vi.advanceTimersByTime(MASTER_LIVE_INTERVAL_MS);
    expect(sent).toEqual([10, 30]);
  });

  it('marks only the committed value as committed', () => {
    const sent: [number, boolean][] = [];
    const throttle = trailingThrottle((value: number, committed: boolean) => {
      sent.push([value, committed]);
    });
    throttle.push(10);
    throttle.commit(25);
    expect(sent).toEqual([
      [10, false],
      [25, true],
    ]);
  });

  it('sends the committed value once and drops the waiting live value', () => {
    const sent: number[] = [];
    const throttle = trailingThrottle((value: number) => sent.push(value));
    throttle.push(10);
    throttle.push(20);
    throttle.commit(25);
    vi.advanceTimersByTime(MASTER_LIVE_INTERVAL_MS * 4);
    expect(sent).toEqual([10, 25]);
  });

  it('starts a fresh window after the interval has passed', () => {
    const sent: number[] = [];
    const throttle = trailingThrottle((value: number) => sent.push(value));
    throttle.push(1);
    vi.advanceTimersByTime(MASTER_LIVE_INTERVAL_MS * 2);
    throttle.push(2);
    expect(sent).toEqual([1, 2]);
  });
});
