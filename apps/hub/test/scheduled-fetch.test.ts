import { describe, expect, it } from 'vitest';
import { ScheduledFetch } from '../src/scheduled-fetch';
import { FakeClock } from './support/fake-clock';

function setup(): { clock: FakeClock; fetches: ScheduledFetch<number>; calls: () => number } {
  const clock = new FakeClock('2026-10-10T09:00:00.000Z');
  let calls = 0;
  const fetches = new ScheduledFetch<number>({
    clock,
    fetch: (): Promise<number> => {
      calls += 1;
      return Promise.resolve(calls);
    },
    retrySeconds: [15, 300, 900],
    minGapMs: 120_000,
  });
  return { clock, fetches, calls: () => calls };
}

describe('ScheduledFetch', () => {
  it('walks the retry list, then keeps the longest delay, and starts over after a reset', () => {
    const { fetches } = setup();
    const delays = [1, 2, 3, 4, 5].map(
      () => (fetches.retryAt().getTime() - Date.parse('2026-10-10T09:00:00.000Z')) / 1000,
    );
    expect(delays).toStrictEqual([15, 300, 900, 900, 900]);
    fetches.reset();
    expect(fetches.retryAt().toISOString()).toBe('2026-10-10T09:00:15.000Z');
  });

  it('shares one running fetch between callers and lets the next call start a new one', async () => {
    const { fetches, calls } = setup();
    const [first, second] = await Promise.all([fetches.run(), fetches.run()]);
    expect([first, second]).toStrictEqual([1, 1]);
    expect(fetches.settled()).toBeNull();
    expect(await fetches.run()).toBe(2);
    expect(calls()).toBe(2);
  });

  it('answers a refresh from the current row inside the minimum gap and fetches outside it', async () => {
    const { clock, fetches, calls } = setup();
    const fetchedAt = '2026-10-10T08:59:00.000Z';
    expect(await fetches.refresh(99, { fetchedAt, healthy: true })).toBe(99);
    expect(calls()).toBe(0);
    clock.advanceTo('2026-10-10T09:01:00.001Z');
    expect(await fetches.refresh(99, { fetchedAt, healthy: true })).toBe(1);
    expect(await fetches.refresh(99, { fetchedAt: null, healthy: true })).toBe(2);
    expect(
      await fetches.refresh(99, { fetchedAt: '2026-10-10T09:01:00.000Z', healthy: false }),
    ).toBe(3);
  });

  it('fetches when its scheduled moment arrives and not after being cancelled or rescheduled', async () => {
    const { clock, fetches, calls } = setup();
    fetches.schedule(new Date('2026-10-10T10:00:00.000Z'));
    fetches.schedule(new Date('2026-10-10T11:00:00.000Z'));
    expect(clock.pending()).toStrictEqual(['2026-10-10T11:00:00.000Z']);
    clock.advanceTo('2026-10-10T11:00:00.000Z');
    await fetches.settled();
    expect(calls()).toBe(1);
    fetches.schedule(new Date('2026-10-10T12:00:00.000Z'));
    fetches.cancel();
    clock.advanceTo('2026-10-10T12:00:00.000Z');
    expect(calls()).toBe(1);
  });
});
