import { describe, expect, it } from 'vitest';
import { COOLDOWN_MEMORY, EMPTY_COOLDOWN, cooldown } from '../../../src/nodes/state/cooldown';

const HOUR = 3_600_000;

describe('cooldown', () => {
  it('passes the first time and remembers the pass', () => {
    const outcome = cooldown(EMPTY_COOLDOWN, { now: 1000, periodMs: HOUR });
    expect(outcome).toStrictEqual({ exit: 'pass', memory: { passedAt: { '': 1000 } } });
    expect(COOLDOWN_MEMORY.parse(outcome.memory)).toStrictEqual(outcome.memory);
  });

  it('blocks inside the period and reports the time left without changing memory', () => {
    const memory = { passedAt: { '': 1000 } };
    const outcome = cooldown(memory, { now: 1000 + HOUR - 1, periodMs: HOUR });
    expect(outcome).toStrictEqual({ exit: 'blocked', remainingMs: 1, memory });
  });

  it('passes again exactly when the period has elapsed', () => {
    const outcome = cooldown({ passedAt: { '': 1000 } }, { now: 1000 + HOUR, periodMs: HOUR });
    expect(outcome).toStrictEqual({ exit: 'pass', memory: { passedAt: { '': 1000 + HOUR } } });
  });

  it('counts each key separately and forgets expired keys on a pass', () => {
    const memory = { passedAt: { kitchen: 0, hall: 5000 } };
    expect(cooldown(memory, { now: 6000, periodMs: HOUR, key: 'bath' }).exit).toBe('pass');
    expect(cooldown(memory, { now: 6000, periodMs: HOUR, key: 'hall' }).exit).toBe('blocked');
    const later = cooldown(memory, { now: HOUR + 1, periodMs: HOUR, key: 'kitchen' });
    expect(later).toStrictEqual({
      exit: 'pass',
      memory: { passedAt: { hall: 5000, kitchen: HOUR + 1 } },
    });
    const pruned = cooldown(memory, { now: HOUR + 6000, periodMs: HOUR, key: 'bath' });
    expect(pruned.memory).toStrictEqual({ passedAt: { bath: HOUR + 6000 } });
  });

  it('always passes with a zero period', () => {
    const memory = { passedAt: { '': 10 } };
    expect(cooldown(memory, { now: 10, periodMs: 0 }).exit).toBe('pass');
  });

  it('rejects memory and input of the wrong shape', () => {
    expect(() => COOLDOWN_MEMORY.parse({ passedAt: { a: -1 } })).toThrow();
    expect(() => COOLDOWN_MEMORY.parse({ passedAt: {}, extra: 1 })).toThrow();
    expect(() => cooldown(EMPTY_COOLDOWN, { now: -1, periodMs: 1 })).toThrow();
  });
});
