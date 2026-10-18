import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { controlLane } from './control-lane';
import { MASTER_LIVE_INTERVAL_MS } from './master-throttle';

describe('controlLane', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends the first value at once and reports whether it went through', async () => {
    const sent: number[] = [];
    const settled = vi.fn();
    const push = controlLane((value) => {
      sent.push(Number(value));
      return Promise.resolve(true);
    }, settled);
    await expect(push(40)).resolves.toBe(true);
    expect(sent).toStrictEqual([40]);
    expect(settled).toHaveBeenCalledWith(true);
  });

  it('sends only the last value of a drag and settles the ones it replaced as not sent', async () => {
    const sent: number[] = [];
    const settled = vi.fn();
    const push = controlLane((value) => {
      sent.push(Number(value));
      return Promise.resolve(true);
    }, settled);
    const first = push(10);
    const second = push(20);
    const third = push(30);
    await vi.advanceTimersByTimeAsync(MASTER_LIVE_INTERVAL_MS);
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(false);
    await expect(third).resolves.toBe(true);
    expect(sent).toStrictEqual([10, 30]);
  });

  it('tells the caller when a send was overtaken by a newer value', async () => {
    const settled = vi.fn();
    const push = controlLane(() => Promise.resolve(false), settled);
    const first = push(10);
    void push(20);
    await first;
    expect(settled).toHaveBeenNthCalledWith(1, false);
  });

  it('reports a failed send as not sent', async () => {
    const push = controlLane(() => Promise.resolve(false), vi.fn());
    await expect(push(5)).resolves.toBe(false);
  });
});
