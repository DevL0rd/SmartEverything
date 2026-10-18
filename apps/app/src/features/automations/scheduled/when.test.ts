import { describe, expect, it } from 'vitest';
import { MOST_MINUTES, clampMinutes, minutesLabel, timingOf, whenLabel, whenOf } from './when';

const NOW = Date.parse('2026-10-16T12:00:00.000Z');

describe('the schedule time picker', () => {
  it('clamps minutes to at least one and at most a week', () => {
    expect(clampMinutes(0)).toBe(1);
    expect(clampMinutes(-5)).toBe(1);
    expect(clampMinutes(2.6)).toBe(3);
    expect(clampMinutes(MOST_MINUTES + 1)).toBe(MOST_MINUTES);
  });

  it('writes a relative choice as seconds and a clock choice as zero padded HH:MM', () => {
    expect(timingOf({ kind: 'in', minutes: 15 })).toEqual({ kind: 'in', seconds: 900 });
    expect(timingOf({ kind: 'at', time: { hour: 7, minute: 5 } })).toEqual({
      kind: 'at',
      at: '07:05',
    });
  });

  it('reads a relative timing back in whole minutes within the allowed range', () => {
    expect(whenOf({ kind: 'in', seconds: 1800 }, 'UTC', NOW)).toEqual({ kind: 'in', minutes: 30 });
    expect(whenOf({ kind: 'in', seconds: 5 }, 'UTC', NOW)).toEqual({ kind: 'in', minutes: 1 });
  });

  it('reads a clock timing as typed', () => {
    expect(whenOf({ kind: 'at', at: '21:45' }, 'UTC', NOW)).toEqual({
      kind: 'at',
      time: { hour: 21, minute: 45 },
    });
  });

  it('reads a stored instant in the home time zone when it is within a day', () => {
    const at = '2026-10-16T20:30:00.000Z';
    expect(whenOf({ kind: 'at', at }, 'Asia/Bangkok', NOW)).toEqual({
      kind: 'at',
      time: { hour: 3, minute: 30 },
    });
  });

  it('cannot edit an instant more than a day away or a repeating schedule', () => {
    expect(whenOf({ kind: 'at', at: '2026-10-18T12:00:00.000Z' }, 'UTC', NOW)).toBeNull();
    expect(
      whenOf({ kind: 'series', everySeconds: 60, count: 3, startAt: null }, 'UTC', NOW),
    ).toBeNull();
    expect(whenOf({ kind: 'times', times: ['2026-10-16T13:00:00.000Z'] }, 'UTC', NOW)).toBeNull();
  });

  it('labels minutes under an hour, whole hours and hours with minutes', () => {
    expect(minutesLabel(45)).toBe('45 min');
    expect(minutesLabel(120)).toBe('2 h');
    expect(minutesLabel(135)).toBe('2 h 15 min');
  });

  it('labels a choice as in a duration or at a clock time', () => {
    expect(whenLabel({ kind: 'in', minutes: 90 })).toBe('in 1 h 30 min');
    expect(whenLabel({ kind: 'at', time: { hour: 6, minute: 0 } })).toBe('at 06:00');
  });
});
