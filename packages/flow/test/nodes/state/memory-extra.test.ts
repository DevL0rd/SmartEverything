import { describe, expect, it } from 'vitest';
import { counter, periodKey } from '../../../src/nodes/state/counter';
import { machine } from '../../../src/nodes/state/machine';
import { timer } from '../../../src/nodes/state/timer';

describe('counter', () => {
  it('counts up, down and resets to the lowest', () => {
    const one = counter(undefined, { now: 0 });
    const two = counter(one.memory, { now: 1 });
    expect(two.value).toBe(2);
    expect(counter(two.memory, { now: 2, op: 'decrement', step: 5, min: 0 }).value).toBe(0);
    expect(counter(two.memory, { now: 2, op: 'reset', min: 10 }).value).toBe(10);
  });

  it('stops at the limits, reports the maximum and can wrap', () => {
    const limits = { min: 1, max: 3 };
    let memory = counter(undefined, { now: 0, op: 'set', to: 3, ...limits });
    expect(memory).toMatchObject({ value: 3, reachedMax: true });
    memory = counter(memory.memory, { now: 1, ...limits });
    expect(memory.value).toBe(3);
    expect(counter(memory.memory, { now: 2, wrap: true, ...limits }).value).toBe(1);
  });

  it('resets when the period changes and keeps keys apart', () => {
    const monday = counter(undefined, { now: 0, periodKey: '2026-10-19' });
    const again = counter(monday.memory, { now: 1, periodKey: '2026-10-19' });
    expect(again.value).toBe(2);
    expect(counter(again.memory, { now: 2, periodKey: '2026-10-20' }).value).toBe(1);
    expect(counter(again.memory, { now: 2, key: 'door', periodKey: '2026-10-19' }).value).toBe(1);
  });

  it('counts only the events inside a recent window', () => {
    const window = { windowMs: 600_000 };
    let memory = counter(undefined, { now: 0, ...window }).memory;
    memory = counter(memory, { now: 100_000, ...window }).memory;
    const third = counter(memory, { now: 650_000, ...window });
    expect(third.value).toBe(2);
    expect(counter(third.memory, { now: 690_000, op: 'decrement', ...window }).value).toBe(1);
  });

  it('refuses wrapping without both limits and a window with wrap', () => {
    expect(() => counter(undefined, { now: 0, wrap: true, min: 0 })).toThrow(/both a lowest/);
    expect(() => counter(undefined, { now: 0, op: 'set' })).toThrow(/needs a value/);
    expect(() => counter(undefined, { now: 0, windowMs: 1, wrap: true, min: 0, max: 2 })).toThrow(
      /recent window/,
    );
  });

  it('names the day, week and month of a local date', () => {
    const date = new Date('2026-10-21T10:00:00Z');
    expect(periodKey('day', date)).toBe('2026-10-21');
    expect(periodKey('month', date)).toBe('2026-10');
    expect(periodKey('week', date)).toBe('week-2026-10-19');
  });
});

describe('timer', () => {
  it('starts with a wake time and keeps a running timer on a second start', () => {
    const started = timer(undefined, { now: 1000, durationMs: 600_000 });
    expect(started).toMatchObject({ running: true, remainingMs: 600_000, wakeAt: 601_000 });
    expect(timer(started.memory, { now: 2000, durationMs: 5 }).wakeAt).toBe(601_000);
  });

  it('restarts, extends, pauses and resumes', () => {
    const base = timer(undefined, { now: 0, durationMs: 1000 });
    expect(timer(base.memory, { now: 200, op: 'restart', durationMs: 1000 }).wakeAt).toBe(1200);
    expect(timer(base.memory, { now: 200, op: 'extend', durationMs: 500 }).wakeAt).toBe(1500);
    const paused = timer(base.memory, { now: 400, op: 'pause' });
    expect(paused).toMatchObject({ running: false, remainingMs: 600, wakeAt: null });
    expect(timer(paused.memory, { now: 9000, op: 'extend', durationMs: 100 }).remainingMs).toBe(
      700,
    );
    expect(timer(paused.memory, { now: 9000, op: 'resume' }).wakeAt).toBe(9600);
  });

  it('cancels, and treats a passed deadline as finished', () => {
    const base = timer(undefined, { now: 0, durationMs: 1000 });
    expect(timer(base.memory, { now: 10, op: 'cancel' })).toMatchObject({
      running: false,
      remainingMs: 0,
      wakeAt: null,
    });
    expect(timer(base.memory, { now: 2000, op: 'pause' }).running).toBe(false);
  });

  it('needs a duration to start', () => {
    expect(() => timer(undefined, { now: 0 })).toThrow(/needs a duration/);
  });
});

describe('machine', () => {
  const home = {
    states: ['home', 'away', 'night'],
    initial: 'home',
    transitions: [
      { from: 'home', event: 'leave', to: 'away' },
      { from: '*', event: 'sleep', to: 'night', guard: true },
      { from: 'away', event: 'arrive', to: 'home', guard: false },
      { from: 'away', event: 'arrive', to: 'night' },
    ],
  };

  it('starts in the initial state and ignores events with no transition', () => {
    expect(machine(undefined, { ...home, event: 'arrive' })).toMatchObject({
      state: 'home',
      previous: 'home',
      changed: false,
    });
  });

  it('moves along the first allowed transition and skips a false guard', () => {
    const left = machine(undefined, { ...home, event: 'leave' });
    expect(left).toMatchObject({ state: 'away', previous: 'home', changed: true });
    expect(machine(left.memory, { ...home, event: 'arrive' }).state).toBe('night');
    expect(machine(left.memory, { ...home, event: 'sleep' }).state).toBe('night');
  });

  it('recovers to the initial state when the kept state was removed', () => {
    const out = machine({ state: 'guests' }, { ...home, event: 'nothing' });
    expect(out).toMatchObject({ state: 'home', recovered: true });
  });

  it('rejects a transition into a missing state', () => {
    expect(() =>
      machine(undefined, {
        ...home,
        event: 'x',
        transitions: [{ from: '*', event: 'x', to: 'gone' }],
      }),
    ).toThrow(/does not exist/);
  });
});
