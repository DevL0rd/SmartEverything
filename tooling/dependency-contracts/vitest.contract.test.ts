import { describe, expect, it, vi } from 'vitest';

describe('vitest contract', () => {
  it('compares deeply with toStrictEqual, distinguishing undefined keys', () => {
    expect({ a: 1 }).toStrictEqual({ a: 1 });
    expect({ a: 1 }).not.toStrictEqual({ a: 1, b: undefined });
  });

  it('supports fake timers, which reminder scheduling will depend on', () => {
    vi.useFakeTimers();
    let fired = false;
    setTimeout(() => {
      fired = true;
    }, 1000);
    vi.advanceTimersByTime(999);
    expect(fired).toBe(false);
    vi.advanceTimersByTime(1);
    expect(fired).toBe(true);
    vi.useRealTimers();
  });

  it('asserts on thrown errors by type and message', () => {
    expect(() => {
      throw new TypeError('boom');
    }).toThrow(TypeError);
  });
});
