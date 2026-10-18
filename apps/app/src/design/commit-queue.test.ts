import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { commitQueue } from './commit-queue';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('commitQueue', () => {
  it('writes once, with the last value, after a burst of taps', () => {
    const save = vi.fn(() => Promise.resolve());
    const queue = commitQueue(save, 600, vi.fn());
    for (const value of [171, 172, 173, 174, 175]) {
      queue.push(value);
      vi.advanceTimersByTime(100);
    }
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600);
    expect(save).toHaveBeenCalledExactlyOnceWith(175);
  });

  it('writes a pending value at once on flush and never twice', () => {
    const save = vi.fn(() => Promise.resolve());
    const queue = commitQueue(save, 600, vi.fn());
    queue.push(180);
    queue.flush();
    queue.flush();
    vi.advanceTimersByTime(1_000);
    expect(save).toHaveBeenCalledExactlyOnceWith(180);
  });

  it('writes to the latest target', () => {
    const first = vi.fn(() => Promise.resolve());
    const second = vi.fn(() => Promise.resolve());
    const queue = commitQueue(first, 600, vi.fn());
    queue.push(10);
    queue.retarget(second);
    vi.advanceTimersByTime(600);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledExactlyOnceWith(10);
  });

  it('reports a failed write so the draft can be dropped', async () => {
    const failed = vi.fn();
    const queue = commitQueue(() => Promise.reject(new Error('offline')), 600, failed);
    queue.push(10);
    await vi.advanceTimersByTimeAsync(600);
    expect(failed).toHaveBeenCalledTimes(1);
  });
});
