import { afterEach, describe, expect, it, vi } from 'vitest';
import { StepFeed } from '../../src/plugins/inbound-progress';
import { Throttle } from '../../src/plugins/throttle';

afterEach(() => {
  vi.useRealTimers();
});

describe('Throttle', () => {
  it('runs at once, then at most once per gap with the burst folded into one run', async () => {
    vi.useFakeTimers();
    let runs = 0;
    const throttle = new Throttle(() => {
      runs += 1;
    }, 250);
    throttle.trigger();
    expect(runs).toBe(1);
    throttle.trigger();
    throttle.trigger();
    expect(runs).toBe(1);
    await vi.advanceTimersByTimeAsync(250);
    expect(runs).toBe(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(runs).toBe(2);
  });

  it('drops a pending run when cancelled', async () => {
    vi.useFakeTimers();
    let runs = 0;
    const throttle = new Throttle(() => {
      runs += 1;
    }, 100);
    throttle.trigger();
    throttle.trigger();
    throttle.cancel();
    await vi.advanceTimersByTimeAsync(500);
    expect(runs).toBe(1);
  });
});

describe('StepFeed', () => {
  it('sends the first step at once, then only the newest step once per gap, never twice', async () => {
    vi.useFakeTimers();
    const sent: string[] = [];
    const feed = new StepFeed(
      (step) => sent.push(step),
      () => Date.now(),
      1000,
    );
    feed.push('reading');
    feed.push('thinking');
    feed.push('writing');
    expect(sent).toEqual(['reading']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent).toEqual(['reading', 'writing']);
    feed.push('writing');
    await vi.advanceTimersByTimeAsync(2000);
    expect(sent).toEqual(['reading', 'writing']);
    feed.push('done');
    feed.push('final');
    feed.stop();
    await vi.advanceTimersByTimeAsync(2000);
    expect(sent).toEqual(['reading', 'writing', 'done']);
  });
});
