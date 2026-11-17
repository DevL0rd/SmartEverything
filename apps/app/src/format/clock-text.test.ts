import { describe, expect, it } from 'vitest';
import { clockLabelOf, clockPartsOf, clockTextOfTime, timeOfClockText } from './clock-text';

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

  it('shows a stored time on the 24-hour clock or as 12-hour time with AM and PM', () => {
    expect(clockPartsOf('07:05', true)).toEqual({ value: '07:05', period: null });
    expect(clockPartsOf('00:00', false).value).toBe('12:00');
    expect(clockPartsOf('12:00', false).value).toBe('12:00');
    expect(clockPartsOf('23:59', false).value).toBe('11:59');
    expect(clockPartsOf('00:00', false).period).not.toBe(clockPartsOf('12:00', false).period);
    expect(clockPartsOf('23:59', false).period).toBe(clockPartsOf('12:00', false).period);
    expect(clockLabelOf('23:59', true)).toBe('23:59');
    expect(clockLabelOf('07:05', false)).toMatch(/^7:05 \S+/u);
  });
});
