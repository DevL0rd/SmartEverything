import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { throttledSend } from './live-commands';

describe('throttledSend', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends the first value at once and only the newest value after each interval', async () => {
    const sent: number[] = [];
    const set = throttledSend((value) => {
      sent.push(Number(value));
      return Promise.resolve(true);
    }, 200);
    const results = [1, 2, 3, 4].map((value) => set(value));
    expect(sent).toStrictEqual([1]);
    await vi.advanceTimersByTimeAsync(200);
    expect(sent).toStrictEqual([1, 4]);
    expect(await Promise.all(results)).toStrictEqual([true, true, true, true]);
  });

  it('reports a replaced value as replaced, not as a failure', async () => {
    const set = throttledSend(() => Promise.resolve(false), 200);
    const first = set(1);
    const replaced = set(2);
    const newest = set(3);
    await vi.advanceTimersByTimeAsync(200);
    expect(await replaced).toBe(true);
    expect(await first).toBe(false);
    expect(await newest).toBe(false);
  });

  it('sends again at once after a quiet interval', async () => {
    const sent: number[] = [];
    const set = throttledSend((value) => {
      sent.push(Number(value));
      return Promise.resolve(true);
    }, 200);
    await set(1);
    await vi.advanceTimersByTimeAsync(500);
    await set(2);
    expect(sent).toStrictEqual([1, 2]);
  });
});
