import { describe, expect, it } from 'vitest';
import { AppEventBudget } from '../../src/computers/app-event-budget';

function budget(
  capacity: number,
  perSecond: number,
): { take: () => boolean; advance: (ms: number) => void; skipped: () => number } {
  let now = 0;
  let lastSkipped = 0;
  const inner = new AppEventBudget({ capacity, perSecond, now: (): number => now });
  return {
    take: (): boolean => {
      const decision = inner.take();
      lastSkipped = decision.skipped;
      return decision.allowed;
    },
    advance: (ms): void => {
      now += ms;
    },
    skipped: (): number => lastSkipped,
  };
}

describe('the app event budget', () => {
  it('allows a burst up to its capacity and then refuses', () => {
    const test = budget(3, 1);
    expect([test.take(), test.take(), test.take(), test.take()]).toEqual([true, true, true, false]);
  });

  it('refills over time at its rate, never beyond its capacity', () => {
    const test = budget(2, 1);
    test.take();
    test.take();
    expect(test.take()).toBe(false);
    test.advance(1000);
    expect(test.take()).toBe(true);
    expect(test.take()).toBe(false);
    test.advance(60_000);
    expect([test.take(), test.take(), test.take()]).toEqual([true, true, false]);
  });

  it('counts the refused events and reports them when events are allowed again', () => {
    const test = budget(1, 1);
    test.take();
    test.take();
    test.take();
    expect(test.skipped()).toBe(2);
    test.advance(1000);
    expect(test.take()).toBe(true);
    expect(test.skipped()).toBe(2);
    expect(test.take()).toBe(false);
    expect(test.skipped()).toBe(1);
  });
});
