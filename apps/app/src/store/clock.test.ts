import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ExternalStore from '../design/external-store';

const writes = vi.hoisted((): { count: number } => ({ count: 0 }));

vi.mock('../design/external-store', async (importOriginal) => {
  const original = await importOriginal<typeof ExternalStore>();
  class CountingStore<T> extends original.ValueStore<T> {
    constructor(initial: T) {
      super(initial);
      const write = this.set;
      Object.defineProperty(this, 'set', {
        value: (next: T): void => {
          writes.count += 1;
          write(next);
        },
      });
    }
  }
  return { ...original, ValueStore: CountingStore };
});

const { readSecond, heldSelection } = await import('./clock');

describe('readSecond', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    writes.count = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the time floored to the second', () => {
    vi.setSystemTime(new Date('2026-10-17T10:00:00.700Z'));
    expect(readSecond()).toBe(Date.parse('2026-10-17T10:00:00.000Z'));
  });

  it('follows the clock between calls while nothing is subscribed', () => {
    vi.setSystemTime(new Date('2026-10-17T10:00:00.700Z'));
    readSecond();
    vi.setSystemTime(new Date('2026-10-17T10:00:05.100Z'));
    expect(readSecond()).toBe(Date.parse('2026-10-17T10:00:05.000Z'));
  });

  it('never writes to the store, so reading during render cannot notify listeners', () => {
    vi.setSystemTime(new Date('2026-10-17T10:00:00.700Z'));
    readSecond();
    vi.setSystemTime(new Date('2026-10-17T10:00:09.000Z'));
    readSecond();
    expect(writes.count).toBe(0);
  });
});

describe('heldSelection', () => {
  const sameText = (left: string, right: string): boolean => left === right;

  it('keeps the held value when the selected value did not change', () => {
    const held = { value: 'Synced 3 min ago' };
    expect(heldSelection(held, 'Synced 3 min ago', sameText)).toBe(held);
  });

  it('replaces the held value when the selected value changed', () => {
    const held = { value: 'Synced 3 min ago' };
    expect(heldSelection(held, 'Synced 4 min ago', sameText).value).toBe('Synced 4 min ago');
  });

  it('starts from the first selection', () => {
    expect(heldSelection(null, 'a', sameText).value).toBe('a');
  });
});
