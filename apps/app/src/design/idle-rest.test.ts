import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IdleRest, followIdle, noteTouch, onTouch } from './idle-rest';

describe('IdleRest', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rests after the idle time and not before', () => {
    const changes: boolean[] = [];
    const rest = new IdleRest(10_000, (resting) => changes.push(resting));
    rest.arm();
    vi.advanceTimersByTime(9_999);
    expect(changes).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(changes).toEqual([true]);
  });

  it('wakes at once and rests again after another idle period', () => {
    const changes: boolean[] = [];
    const rest = new IdleRest(10_000, (resting) => changes.push(resting));
    rest.arm();
    vi.advanceTimersByTime(10_000);
    rest.wake();
    expect(changes).toEqual([true, false]);
    vi.advanceTimersByTime(9_999);
    expect(changes).toEqual([true, false]);
    vi.advanceTimersByTime(1);
    expect(changes).toEqual([true, false, true]);
  });

  it('a touch before the deadline postpones resting', () => {
    const changes: boolean[] = [];
    const rest = new IdleRest(10_000, (resting) => changes.push(resting));
    rest.arm();
    vi.advanceTimersByTime(6_000);
    rest.wake();
    vi.advanceTimersByTime(6_000);
    expect(changes).toEqual([false]);
    vi.advanceTimersByTime(4_000);
    expect(changes).toEqual([false, true]);
  });

  it('cancel stops a pending rest', () => {
    const changes: boolean[] = [];
    const rest = new IdleRest(10_000, (resting) => changes.push(resting));
    rest.arm();
    rest.cancel();
    vi.advanceTimersByTime(20_000);
    expect(changes).toEqual([]);
  });

  describe('orb on the chat screen', () => {
    function orb(): {
      readonly changes: boolean[];
      readonly rest: IdleRest;
      idle: boolean;
      off: () => void;
    } {
      const changes: boolean[] = [];
      const rest = new IdleRest(10_000, (resting) => changes.push(resting));
      const state = { changes, rest, idle: true, off: (): void => undefined };
      state.off = onTouch(() => {
        if (state.idle) {
          rest.wake();
        }
      });
      followIdle(rest, true);
      return state;
    }

    it('rests after 10 s and wakes on a touch', () => {
      const chat = orb();
      vi.advanceTimersByTime(10_000);
      expect(chat.changes).toEqual([false, true]);
      noteTouch();
      expect(chat.changes).toEqual([false, true, false]);
      chat.off();
    });

    it('active states never rest and a touch does not arm them', () => {
      const chat = orb();
      chat.idle = false;
      followIdle(chat.rest, false);
      noteTouch();
      vi.advanceTimersByTime(60_000);
      expect(chat.changes).toEqual([false]);
      chat.off();
    });

    it('returning to idle after work starts a fresh countdown', () => {
      const chat = orb();
      chat.idle = false;
      followIdle(chat.rest, false);
      vi.advanceTimersByTime(30_000);
      chat.idle = true;
      followIdle(chat.rest, true);
      vi.advanceTimersByTime(9_999);
      expect(chat.changes).toEqual([false, false]);
      vi.advanceTimersByTime(1);
      expect(chat.changes).toEqual([false, false, true]);
      chat.off();
    });
  });
});
