import { describe, expect, it } from 'vitest';
import { DAY_MS, HOUR_MS } from '../../../format/time';
import {
  dayCountOf,
  endLabelOf,
  endOfDayAfter,
  endsSoon,
  grantEndOf,
  grantEndOptionsOf,
  isPresetEnd,
  latestDayCount,
  presetEndAt,
  timeLeftColourOf,
  timeLeftShareOf,
} from './grant-expiry';

const NOW = Date.parse('2026-11-07T12:00:00.000Z');
const at = (offset: number): string => new Date(NOW + offset).toISOString();

describe('grant expiry presets', () => {
  it('offers never, 1, 7 and 30 days and a date, the date naming the current end', () => {
    expect(grantEndOptionsOf(null, NOW).map((option) => option.label)).toEqual([
      'Never',
      '1 day',
      '7 days',
      '30 days',
      'Pick a date',
    ]);
    expect(grantEndOptionsOf(at(3 * DAY_MS), NOW)[4]?.label).toMatch(/· Ends in 3 days$/);
  });

  it('turns a preset into an end that many days from now', () => {
    expect(presetEndAt('day', NOW)).toBe(at(DAY_MS));
    expect(presetEndAt('week', NOW)).toBe(at(7 * DAY_MS));
    expect(presetEndAt('month', NOW)).toBe(at(30 * DAY_MS));
    expect(isPresetEnd('never')).toBe(false);
    expect(isPresetEnd('date')).toBe(false);
    expect(isPresetEnd('week')).toBe(true);
  });

  it('shows a set end as a date and no end as never', () => {
    expect(grantEndOf(null)).toBe('never');
    expect(grantEndOf(at(DAY_MS))).toBe('date');
  });
});

describe('a picked date', () => {
  it('ends at the last moment of the local day, days after today', () => {
    const end = new Date(endOfDayAfter(NOW, 3));
    const expected = new Date(NOW);
    expected.setHours(23, 59, 59, 999);
    expected.setDate(expected.getDate() + 3);
    expect(end.getTime()).toBe(expected.getTime());
    expect(Date.parse(endOfDayAfter(NOW, 1))).toBeGreaterThan(NOW);
  });

  it('starts the day count from the current end, or a week when there is none', () => {
    expect(dayCountOf(null, NOW)).toBe(7);
    expect(dayCountOf(endOfDayAfter(NOW, 12), NOW)).toBe(12);
    expect(dayCountOf(at(HOUR_MS), NOW)).toBe(1);
  });

  it('reaches as far as an ISO date can go and no further', () => {
    const last = latestDayCount(NOW);
    expect(Date.parse(endOfDayAfter(NOW, last + 10))).toBe(Date.parse('9999-12-31T23:59:59.999Z'));
  });
});

describe('time left', () => {
  it('labels the end in hours and days and an end in the past as ended', () => {
    expect(endLabelOf(null, NOW)).toBe('No end');
    expect(endLabelOf(at(20 * 60_000), NOW)).toBe('Ends within the hour');
    expect(endLabelOf(at(5 * HOUR_MS), NOW)).toBe('Ends in 5 hours');
    expect(endLabelOf(at(2 * DAY_MS + HOUR_MS), NOW)).toBe('Ends in 2 days');
    expect(endLabelOf(at(-HOUR_MS), NOW)).toBe('Ended');
  });

  it('fills the bar with the share of the access period still left', () => {
    const grant = { createdAt: at(-3 * DAY_MS), expiresAt: at(DAY_MS) };
    expect(timeLeftShareOf(grant, NOW)).toBeCloseTo(0.25);
    expect(timeLeftShareOf({ ...grant, expiresAt: null }, NOW)).toBeNull();
    expect(timeLeftShareOf({ ...grant, expiresAt: at(-DAY_MS) }, NOW)).toBe(0);
    expect(timeLeftShareOf({ createdAt: at(DAY_MS), expiresAt: at(DAY_MS) }, NOW)).toBe(0);
  });

  it('warns when less than a day is left', () => {
    expect(endsSoon(at(5 * HOUR_MS), NOW)).toBe(true);
    expect(endsSoon(at(2 * DAY_MS), NOW)).toBe(false);
    expect(endsSoon(null, NOW)).toBe(false);
    expect(timeLeftColourOf(at(5 * HOUR_MS), NOW)).toBe('warning');
    expect(timeLeftColourOf(at(5 * DAY_MS), NOW)).toBe('primary');
  });
});
