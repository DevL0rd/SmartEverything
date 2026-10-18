import { describe, expect, it } from 'vitest';
import { LoadOnce, mapBounded } from '../../src/adapters/tuya/bounded';

describe('mapBounded', () => {
  it('keeps the order of the items and never exceeds the limit', async () => {
    let active = 0;
    let peak = 0;
    const doubled = await mapBounded([5, 1, 4, 2, 3, 6], 2, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, value));
      active -= 1;
      return value * 2;
    });
    expect(doubled).toEqual([10, 2, 8, 4, 6, 12]);
    expect(peak).toBe(2);
  });

  it('handles fewer items than lanes and no items', async () => {
    expect(await mapBounded([1], 4, (value) => Promise.resolve(value))).toEqual([1]);
    expect(await mapBounded([], 4, (value: number) => Promise.resolve(value))).toEqual([]);
  });
});

describe('LoadOnce', () => {
  it('loads a key once, shares a load in flight and forgets a failed load', async () => {
    const cache = new LoadOnce<number>();
    let loads = 0;
    const load = (): Promise<number> => {
      loads += 1;
      return Promise.resolve(loads);
    };
    const [first, second] = await Promise.all([cache.get('a', load), cache.get('a', load)]);
    expect([first, second, await cache.get('a', load)]).toEqual([1, 1, 1]);
    await expect(cache.get('b', () => Promise.reject(new Error('down')))).rejects.toThrow('down');
    expect(await cache.get('b', load)).toBe(2);
  });
});
