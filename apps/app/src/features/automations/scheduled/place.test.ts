import { describe, expect, it } from 'vitest';
import { dayWindow, placeOf } from './place';

describe('placeOf', () => {
  it('reads a home with a valid zone, with a location only when both coordinates are set', () => {
    expect(placeOf({ time_zone: 'Europe/Paris', latitude: 48.8, longitude: 2.3 })).toEqual({
      usable: true,
      place: { timeZone: 'Europe/Paris', location: { latitude: 48.8, longitude: 2.3 } },
    });
    expect(placeOf({ time_zone: 'Europe/Paris', latitude: 48.8, longitude: null })).toEqual({
      usable: true,
      place: { timeZone: 'Europe/Paris', location: null },
    });
  });

  it('is not usable with a time zone that does not exist', () => {
    const reading = placeOf({ time_zone: 'Mars/Base', latitude: null, longitude: null });
    expect(reading.usable).toBe(false);
  });
});

describe('dayWindow', () => {
  it('spans the local day of the home zone, not of the device', () => {
    const window = dayWindow(new Date('2026-10-16T03:00:00Z'), 'America/New_York', 0);
    expect(window.start.toISOString()).toBe('2026-10-15T04:00:00.000Z');
    expect(window.end.toISOString()).toBe('2026-10-16T04:00:00.000Z');
  });

  it('is 25 hours long on the day the clocks go back and 23 when they go forward', () => {
    const back = dayWindow(new Date('2026-11-01T12:00:00Z'), 'America/New_York', 0);
    expect((back.end.getTime() - back.start.getTime()) / 3_600_000).toBe(25);
    const forward = dayWindow(new Date('2026-03-08T12:00:00Z'), 'America/New_York', 0);
    expect((forward.end.getTime() - forward.start.getTime()) / 3_600_000).toBe(23);
  });

  it('moves by whole local days and can span several, across a month end', () => {
    const next = dayWindow(new Date('2026-10-31T12:00:00Z'), 'UTC', 1, 2);
    expect(next.start.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(next.end.toISOString()).toBe('2026-11-03T00:00:00.000Z');
    const before = dayWindow(new Date('2026-03-01T12:00:00Z'), 'UTC', -1);
    expect(before.start.toISOString()).toBe('2026-02-28T00:00:00.000Z');
  });
});
