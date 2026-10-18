import { describe, expect, it } from 'vitest';
import { clockLabel, clockTextOf, parseClockText } from './clock-text';

describe('parseClockText', () => {
  it('reads hours and minutes, with or without seconds and a leading zero', () => {
    expect(parseClockText('07:30')).toEqual({ hour: 7, minute: 30 });
    expect(parseClockText('7:05')).toEqual({ hour: 7, minute: 5 });
    expect(parseClockText('23:59:59')).toEqual({ hour: 23, minute: 59 });
    expect(parseClockText('  00:00 ')).toEqual({ hour: 0, minute: 0 });
  });

  it('refuses an hour of 24 or more, a minute of 60 or more and text that is not a time', () => {
    expect(parseClockText('24:00')).toBeNull();
    expect(parseClockText('12:60')).toBeNull();
    expect(parseClockText('12')).toBeNull();
    expect(parseClockText('12:5')).toBeNull();
    expect(parseClockText('noon')).toBeNull();
    expect(parseClockText('')).toBeNull();
  });
});

describe('clock text', () => {
  it('writes two digits for each part', () => {
    expect(clockLabel({ hour: 7, minute: 5 })).toBe('07:05');
  });

  it('adds zero seconds for a device that keeps seconds', () => {
    expect(clockTextOf({ hour: 7, minute: 5 }, 'seconds')).toBe('07:05:00');
    expect(clockTextOf({ hour: 7, minute: 5 }, 'minutes')).toBe('07:05');
  });
});
