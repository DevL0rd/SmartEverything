import { describe, expect, it } from 'vitest';
import { placeStatus } from './place-status';
import type { PlaceReading } from './schedule';

const HOME: PlaceReading = {
  usable: true,
  place: { timeZone: 'Europe/Paris', location: { latitude: 48.8, longitude: 2.3 } },
};

describe('placeStatus', () => {
  it('is invalid when the home place cannot be used', () => {
    expect(placeStatus({ usable: false, problem: 'bad' }, 'Europe/Paris', true)).toEqual({
      kind: 'invalid',
    });
  });

  it('warns when the device is in another time zone than the home', () => {
    expect(placeStatus(HOME, 'America/New_York', false)).toEqual({
      kind: 'zone-differs',
      home: 'Europe/Paris',
      device: 'America/New_York',
    });
  });

  it('needs a location only when the rule follows the sun', () => {
    const noLocation: PlaceReading = {
      usable: true,
      place: { timeZone: 'Europe/Paris', location: null },
    };
    expect(placeStatus(noLocation, 'Europe/Paris', true)).toEqual({ kind: 'no-location' });
    expect(placeStatus(noLocation, 'Europe/Paris', false)).toEqual({ kind: 'ok' });
    expect(placeStatus(HOME, 'Europe/Paris', true)).toEqual({ kind: 'ok' });
  });

  it('puts a differing zone before a missing location', () => {
    const noLocation: PlaceReading = {
      usable: true,
      place: { timeZone: 'Europe/Paris', location: null },
    };
    expect(placeStatus(noLocation, 'UTC', true).kind).toBe('zone-differs');
  });
});
