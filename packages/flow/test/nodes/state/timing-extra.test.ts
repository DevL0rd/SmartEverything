import { describe, expect, it } from 'vitest';
import { arrive, settle } from '../../../src/nodes/state/debounce';
import { clockMs, quietHours } from '../../../src/nodes/state/quiet-hours';
import { rateLimit } from '../../../src/nodes/state/rate-limit';

describe('debounce', () => {
  it('lets only the newest arrival continue', () => {
    const first = arrive(undefined, { now: 0, quietMs: 1000 });
    const second = arrive(first.memory, { now: 400, quietMs: 1000 });
    expect(second).toMatchObject({ ticket: 2, dueAt: 1400 });
    expect(settle(second.memory, { ticket: first.ticket }).exit).toBe('superseded');
    const done = settle(second.memory, { ticket: second.ticket });
    expect(done.exit).toBe('continue');
    expect(done.memory.latest).toStrictEqual({});
  });

  it('keeps keys apart', () => {
    const kitchen = arrive(undefined, { now: 0, quietMs: 10, key: 'kitchen' });
    const hall = arrive(kitchen.memory, { now: 1, quietMs: 10, key: 'hall' });
    expect(settle(hall.memory, { ticket: kitchen.ticket, key: 'kitchen' }).exit).toBe('continue');
  });

  it('rejects a negative quiet period', () => {
    expect(() => arrive(undefined, { now: 0, quietMs: -1 })).toThrow();
  });
});

describe('rate limit', () => {
  const rule = { max: 3, windowMs: 600_000 };

  it('passes up to the limit and drops the rest until the window moves on', () => {
    let memory = rateLimit(undefined, { ...rule, now: 0 }).memory;
    memory = rateLimit(memory, { ...rule, now: 1000 }).memory;
    memory = rateLimit(memory, { ...rule, now: 2000 }).memory;
    const over = rateLimit(memory, { ...rule, now: 3000 });
    expect(over.exit).toBe('dropped');
    expect(rateLimit(over.memory, { ...rule, now: 600_001 }).exit).toBe('pass');
  });

  it('queues an excess run for the next free slot and keeps the slots in order', () => {
    const base = { ...rule, max: 1, excess: 'queue' as const };
    const first = rateLimit(undefined, { ...base, now: 0 });
    const second = rateLimit(first.memory, { ...base, now: 100 });
    const third = rateLimit(second.memory, { ...base, now: 200 });
    expect(first).toMatchObject({ exit: 'pass', delayMs: 0 });
    expect(second).toMatchObject({ exit: 'pass', delayMs: 599_900 });
    expect(third).toMatchObject({ exit: 'pass', delayMs: 1_199_800 });
  });

  it('counts each key separately', () => {
    const a = rateLimit(undefined, { max: 1, windowMs: 1000, now: 0, key: 'a' });
    expect(rateLimit(a.memory, { max: 1, windowMs: 1000, now: 1, key: 'b' }).exit).toBe('pass');
  });
});

describe('quiet hours', () => {
  const night = { from: '21:00', to: '07:00' };
  const at = (hours: number, minutes = 0): number => (hours * 60 + minutes) * 60_000;

  it('passes outside the window', () => {
    expect(quietHours({ ...night, msOfDay: at(12) })).toStrictEqual({ exit: 'pass', holdMs: 0 });
  });

  it('holds until the window ends across midnight', () => {
    expect(quietHours({ ...night, msOfDay: at(23) })).toStrictEqual({
      exit: 'pass',
      holdMs: at(8),
    });
    expect(quietHours({ ...night, msOfDay: at(6, 30) })).toStrictEqual({
      exit: 'pass',
      holdMs: at(0, 30),
    });
  });

  it('takes the held exit when asked to skip', () => {
    expect(quietHours({ ...night, msOfDay: at(23), quiet: 'skip' })).toStrictEqual({
      exit: 'held',
    });
  });

  it('lets an urgent run through', () => {
    expect(
      quietHours({ ...night, msOfDay: at(23), priority: 5, bypass: 5, quiet: 'skip' }),
    ).toStrictEqual({
      exit: 'pass',
      holdMs: 0,
    });
  });

  it('treats equal ends as no window and refuses a bad time', () => {
    expect(quietHours({ from: '08:00', to: '08:00', msOfDay: at(8) }).exit).toBe('pass');
    expect(() => clockMs('25:00')).toThrow(/not a time of day/);
  });
});
