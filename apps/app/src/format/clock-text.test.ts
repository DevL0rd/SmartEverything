import { describe, expect, it } from 'vitest';
import { clockTextOfTime, timeOfClockText } from './clock-text';

describe('clock text', () => {
  it('reads the hour and the minute out of a clock time', () => {
    expect(timeOfClockText('07:05')).toEqual({ hour: 7, minute: 5 });
    expect(timeOfClockText('23:59')).toEqual({ hour: 23, minute: 59 });
  });

  it('writes a time as two digits for the hour and the minute', () => {
    expect(clockTextOfTime({ hour: 7, minute: 5 })).toBe('07:05');
    expect(clockTextOfTime({ hour: 0, minute: 0 })).toBe('00:00');
  });

  it('round trips every minute of the day', () => {
    for (let minute = 0; minute < 1440; minute += 1) {
      const time = { hour: Math.floor(minute / 60), minute: minute % 60 };
      expect(timeOfClockText(clockTextOfTime(time))).toEqual(time);
    }
  });
});
