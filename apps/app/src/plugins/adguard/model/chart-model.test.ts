import { describe, expect, it } from 'vitest';
import { clock, HOUR_MS } from '../../../format/time';
import { axisTicks, hourlyStack, spokenBar, summaryOf, tooltipOf, valueTicks } from './chart-model';
import { statsFixture } from './snapshot-fixture';

const NOW = new Date(2026, 9, 17, 13, 30).toISOString();
function must<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('expected a value');
  }
  return value;
}

const HOUR_START = new Date(2026, 9, 17, 13, 0).getTime();

describe('hourlyStack', () => {
  it('ends on the current hour and steps back one hour per bucket', () => {
    const bars = hourlyStack(statsFixture(), NOW);
    expect(bars).toHaveLength(24);
    expect(bars[23]?.at).toBe(HOUR_START);
    expect(bars[22]?.at).toBe(HOUR_START - HOUR_MS);
    expect(bars[0]?.at).toBe(HOUR_START - 23 * HOUR_MS);
    expect(bars[23]?.label).toBe(clock(HOUR_START));
  });

  it('stacks blocked under allowed so the two add up to the lookups of the hour', () => {
    const stats = statsFixture({ history: [1_240, 10], historyBlocked: [180, 0] });
    const [first, second] = hourlyStack(stats, NOW);
    expect(first).toMatchObject({ total: 1_240, blocked: 180, allowed: 1_060 });
    expect(second).toMatchObject({ total: 10, blocked: 0, allowed: 10 });
  });

  it('labels daily buckets by date when the stats period is days', () => {
    const stats = statsFixture({ history: [3, 4], historyBlocked: [1, 1], timeUnit: 'days' });
    const bars = hourlyStack(stats, NOW);
    expect(must(bars[1]).at - must(bars[0]).at).toBe(24 * HOUR_MS);
  });
});

describe('tooltip and summary', () => {
  const bars = hourlyStack(
    statsFixture({ history: [1_240, 0, 300], historyBlocked: [180, 0, 30] }),
    NOW,
  );

  it('writes lookups, blocked and the blocked share for one bar', () => {
    expect(tooltipOf(must(bars[0]))).toBe(
      `${must(bars[0]).label} · 1,240 lookups · 180 blocked (15 %)`,
    );
  });

  it('says so when an hour had no lookups', () => {
    expect(tooltipOf(must(bars[1]))).toBe(`${must(bars[1]).label} · No lookups`);
  });

  it('names the busiest hour and the blocked total for screen readers', () => {
    expect(summaryOf(bars, 'hours')).toBe(
      `Busiest hour was ${must(bars[0]).label} with 1,240 lookups; 210 blocked in total.`,
    );
    expect(spokenBar(must(bars[2]))).toBe(`${must(bars[2]).label}, 300 lookups, 30 blocked`);
  });
});

describe('axisTicks', () => {
  it('marks every sixth clock hour and ends on "now", never crowding the end', () => {
    const bars = hourlyStack(statsFixture(), NOW);
    const ticks = axisTicks(bars, 'hours');
    expect(ticks.at(-1)).toEqual({ index: 23, label: 'now' });
    const inner = ticks.slice(0, -1);
    expect(inner.length).toBeGreaterThanOrEqual(3);
    for (const tick of inner) {
      expect(new Date(bars[tick.index]?.at ?? 0).getHours() % 6).toBe(0);
      expect(23 - tick.index).toBeGreaterThanOrEqual(3);
    }
  });

  it('marks every seventh day and ends on "today" for daily stats', () => {
    const stats = statsFixture({
      history: Array.from({ length: 30 }, () => 1),
      historyBlocked: Array.from({ length: 30 }, () => 0),
      timeUnit: 'days',
    });
    const ticks = axisTicks(hourlyStack(stats, NOW), 'days');
    expect(ticks.map((tick) => 29 - tick.index)).toEqual([28, 21, 14, 7, 0]);
    expect(ticks.at(-1)?.label).toBe('today');
  });
});

describe('valueTicks', () => {
  it('starts at zero and reaches the busiest hour', () => {
    const ticks = valueTicks(
      hourlyStack(statsFixture({ history: [900, 400], historyBlocked: [0, 0] }), NOW),
    );
    expect(ticks[0]).toBe(0);
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(900);
  });

  it('still gives a usable scale when nothing was looked up', () => {
    const ticks = valueTicks(hourlyStack(statsFixture({ history: [0], historyBlocked: [0] }), NOW));
    expect(ticks[0]).toBe(0);
    expect(ticks.at(-1)).toBeGreaterThan(0);
  });
});
