import { afterEach, describe, expect, it, vi } from 'vitest';
import { Loop } from '../../src/plugins/loop';

afterEach(() => {
  vi.useRealTimers();
});

describe('Loop', () => {
  it('waits one interval after start and then again after each run finishes', async () => {
    vi.useFakeTimers();
    const runs: number[] = [];
    const loop = new Loop(
      () => {
        runs.push(Date.now());
        return Promise.resolve();
      },
      () => 1000,
    );
    loop.start();
    await vi.advanceTimersByTimeAsync(999);
    expect(runs).toEqual([]);
    await vi.advanceTimersByTimeAsync(2001);
    expect(runs).toHaveLength(3);
    loop.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(runs).toHaveLength(3);
  });

  it('runs now without overlapping a run in progress, and reads the interval each time', async () => {
    vi.useFakeTimers();
    let interval: number | null = 1000;
    let release: () => void = () => undefined;
    let started = 0;
    const loop = new Loop(
      () => {
        started += 1;
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      },
      () => interval,
    );
    loop.runNow();
    loop.runNow();
    expect(started).toBe(1);
    interval = null;
    release();
    await vi.advanceTimersByTimeAsync(5000);
    expect(started).toBe(1);
    interval = 200;
    loop.runNow();
    release();
    await vi.advanceTimersByTimeAsync(400);
    expect(started).toBe(3);
    loop.stop();
  });
});
