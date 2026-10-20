import { describe, expect, it } from 'vitest';
import { SLICE_STEPS, Scheduler } from '../../../src/automations/driver/scheduler';
import type { Runnable, SliceEnd, SliceLimit } from '../../../src/automations/driver/scheduler';

function counting(log: string[], name: string, slices: number): Runnable {
  let left = slices;
  return {
    slice: (): SliceEnd => {
      log.push(name);
      left -= 1;
      return left > 0 ? 'ready' : 'idle';
    },
    crashed: () => undefined,
  };
}

function manual(): {
  yields: (() => void)[];
  yieldNow: (resume: () => void) => void;
  run: () => void;
} {
  const yields: (() => void)[] = [];
  return {
    yields,
    yieldNow: (resume): void => {
      yields.push(resume);
    },
    run: (): void => {
      for (let guard = 0; guard < 1000 && yields.length > 0; guard += 1) yields.shift()?.();
    },
  };
}

const zero = (): number => 0;

describe('Scheduler', () => {
  it('runs runnables round robin from one FIFO', () => {
    const { yieldNow, run } = manual();
    const scheduler = new Scheduler({ monotonic: zero, yieldNow });
    const log: string[] = [];
    scheduler.schedule(counting(log, 'a', 3));
    scheduler.schedule(counting(log, 'b', 2));
    run();
    expect(log).toEqual(['a', 'b', 'a', 'b', 'a']);
  });

  it('queues a runnable once however often it is scheduled', () => {
    const { yieldNow, run } = manual();
    const scheduler = new Scheduler({ monotonic: zero, yieldNow });
    const log: string[] = [];
    const only = counting(log, 'a', 1);
    scheduler.schedule(only);
    scheduler.schedule(only);
    scheduler.schedule(only);
    run();
    expect(log).toEqual(['a']);
  });

  it('does nothing while idle and wakes on the next schedule', () => {
    const { yields, yieldNow, run } = manual();
    const scheduler = new Scheduler({ monotonic: zero, yieldNow });
    expect(yields).toHaveLength(0);
    const log: string[] = [];
    scheduler.schedule(counting(log, 'a', 1));
    run();
    expect(yields).toHaveLength(0);
    scheduler.schedule(counting(log, 'b', 1));
    expect(yields).toHaveLength(1);
    run();
    expect(log).toEqual(['a', 'b']);
  });

  it('tells a slice to stop after 256 steps and after 4 ms', () => {
    const { yieldNow, run } = manual();
    let clock = 0;
    const scheduler = new Scheduler({ monotonic: (): number => clock, yieldNow });
    const limits: SliceLimit[] = [];
    scheduler.schedule({
      slice: (limit): SliceEnd => {
        limits.push(limit);
        return 'idle';
      },
      crashed: () => undefined,
    });
    run();
    const [limit] = limits;
    expect(limit?.exhausted(SLICE_STEPS - 1)).toBe(false);
    expect(limit?.exhausted(SLICE_STEPS)).toBe(true);
    clock = 3.9;
    expect(limit?.exhausted(1)).toBe(false);
    clock = 4;
    expect(limit?.exhausted(1)).toBe(true);
  });

  it('isolates a crashing runnable from the rest of the queue', () => {
    const { yieldNow, run } = manual();
    const scheduler = new Scheduler({ monotonic: zero, yieldNow });
    const log: string[] = [];
    const crashes: unknown[] = [];
    scheduler.schedule({
      slice: () => {
        throw new Error('boom');
      },
      crashed: (cause) => crashes.push(cause),
    });
    scheduler.schedule(counting(log, 'survivor', 1));
    run();
    expect(crashes).toHaveLength(1);
    expect(log).toEqual(['survivor']);
  });

  it('keeps scheduling other runs when crashed() itself throws', () => {
    const { yieldNow, run } = manual();
    const log: string[] = [];
    const scheduler = new Scheduler({ monotonic: (): number => 0, yieldNow });
    scheduler.schedule({
      slice: (): SliceEnd => {
        throw new Error('slice fault');
      },
      crashed: () => {
        throw new Error('sink fault');
      },
    });
    scheduler.schedule(counting(log, 'survivor', 1));
    expect(run).not.toThrow();
    expect(log).toEqual(['survivor']);
    scheduler.schedule(counting(log, 'later', 1));
    run();
    expect(log).toEqual(['survivor', 'later']);
  });

  it('lets the event loop run between slices of a run that never parks (D1 starvation probe)', async () => {
    const scheduler = new Scheduler({ monotonic: (): number => performance.now() });
    const order: string[] = [];
    let slices = 0;
    scheduler.schedule({
      slice: (): SliceEnd => {
        slices += 1;
        for (const until = performance.now() + 2; performance.now() < until;) continue;
        order.push(`slice${String(slices)}`);
        return slices < 5 ? 'ready' : 'idle';
      },
      crashed: () => undefined,
    });
    const probe = new Promise<void>((resolve) => {
      setImmediate(() => {
        order.push('probe');
        resolve();
      });
    });
    const timer = new Promise<void>((resolve) => {
      setTimeout(() => {
        order.push('timer');
        resolve();
      }, 0);
    });
    await Promise.all([probe, timer]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(order.indexOf('probe')).toBeGreaterThan(-1);
    expect(order.indexOf('probe')).toBeLessThan(order.indexOf('slice5'));
    expect(order.indexOf('timer')).toBeLessThan(order.indexOf('slice5'));
  });
});
