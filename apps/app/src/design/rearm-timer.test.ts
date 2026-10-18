import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RearmTimer } from './rearm-timer';

describe('RearmTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires once, a full delay after the last rearm, creating one timer for a burst', () => {
    const fire = vi.fn();
    const spy = vi.spyOn(globalThis, 'setTimeout');
    const timer = new RearmTimer(fire);
    for (let step = 0; step < 20; step += 1) {
      timer.rearm(100);
      vi.advanceTimersByTime(10);
    }
    expect(fire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fire).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it('cancels', () => {
    const fire = vi.fn();
    const timer = new RearmTimer(fire);
    timer.rearm(50);
    timer.cancel();
    vi.advanceTimersByTime(500);
    expect(fire).not.toHaveBeenCalled();
  });

  it('can be used again after firing', () => {
    const fire = vi.fn();
    const timer = new RearmTimer(fire);
    timer.rearm(50);
    vi.advanceTimersByTime(60);
    timer.rearm(50);
    vi.advanceTimersByTime(60);
    expect(fire).toHaveBeenCalledTimes(2);
  });
});
