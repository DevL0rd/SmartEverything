import { describe, expect, it } from 'vitest';
import { hourInPeriod, hourOfShown, periodOf, shownHourOf } from './time-field';

describe('12-hour time entry', () => {
  it('shows midnight as 12 AM and noon as 12 PM', () => {
    expect([shownHourOf(0, true), periodOf(0)]).toEqual([12, 'am']);
    expect([shownHourOf(12, true), periodOf(12)]).toEqual([12, 'pm']);
    expect([shownHourOf(23, true), periodOf(23)]).toEqual([11, 'pm']);
  });

  it('stores 12 AM, 12 PM and 11:59 PM as one canonical 24-hour time', () => {
    expect(hourOfShown(12, 'am', true)).toBe(0);
    expect(hourOfShown(12, 'pm', true)).toBe(12);
    expect(hourOfShown(11, 'pm', true)).toBe(23);
    expect(hourOfShown(7, 'am', true)).toBe(7);
  });

  it('moves the same clock hour across AM and PM with the toggle', () => {
    expect(hourInPeriod(0, 'pm')).toBe(12);
    expect(hourInPeriod(12, 'am')).toBe(0);
    expect(hourInPeriod(23, 'am')).toBe(11);
    expect(hourInPeriod(9, 'pm')).toBe(21);
  });

  it('keeps 24-hour entry as typed', () => {
    expect(shownHourOf(0, false)).toBe(0);
    expect(shownHourOf(23, false)).toBe(23);
    expect(hourOfShown(17, 'am', false)).toBe(17);
  });
});
