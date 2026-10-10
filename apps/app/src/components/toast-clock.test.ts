import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastClock } from './toast-clock';

describe('a toast clock', () => {
  const expired: number[] = [];
  const clock = new ToastClock((id) => {
    expired.push(id);
  });

  beforeEach(() => {
    vi.useFakeTimers();
    expired.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('expires a shown toast after its time', () => {
    clock.show(1, 4000);
    vi.advanceTimersByTime(3999);
    expect(expired).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(expired).toEqual([1]);
  });

  it('pauses while held and resumes with the time that was left', () => {
    clock.show(2, 4000);
    vi.advanceTimersByTime(1000);
    clock.hold(2, 'touch');
    vi.advanceTimersByTime(60000);
    expect(expired).toEqual([]);
    clock.release(2, 'touch');
    vi.advanceTimersByTime(3000);
    expect(expired).toEqual([2]);
  });

  it('keeps waiting until every hold is released', () => {
    clock.show(3, 4000);
    clock.hold(3, 'hover');
    clock.hold(3, 'touch');
    clock.release(3, 'touch');
    vi.advanceTimersByTime(10000);
    expect(expired).toEqual([]);
    clock.release(3, 'hover');
    vi.advanceTimersByTime(4000);
    expect(expired).toEqual([3]);
  });

  it('starts over on restart and never fires after forget', () => {
    clock.show(4, 4000);
    vi.advanceTimersByTime(3000);
    clock.restart(4, 6000);
    vi.advanceTimersByTime(5999);
    expect(expired).toEqual([]);
    clock.forget(4);
    vi.advanceTimersByTime(10000);
    expect(expired).toEqual([]);
  });
});
