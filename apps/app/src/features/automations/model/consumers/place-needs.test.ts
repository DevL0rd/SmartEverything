import { describe, expect, it } from 'vitest';
import { placeStatusFor, usesSun, type PlaceReading } from './place-needs';
import { lit, program, trigger } from './consumer-fixtures';

const SUN = program([trigger(1, 'trigger.sun', { event: lit('sunset') })], []);
const CLOCK = program([trigger(1, 'trigger.time', { at: lit('07:00') })], []);
const MUTED = program(
  [trigger(1, 'trigger.sun', { event: lit('sunset') }, { enabled: false })],
  [],
);
const NO_LOCATION: PlaceReading = {
  usable: true,
  place: { timeZone: 'Europe/Paris', location: null },
};

describe('place needs', () => {
  it('knows when a rule follows the sun', () => {
    expect(usesSun([CLOCK, SUN])).toBe(true);
    expect(usesSun([CLOCK, MUTED])).toBe(false);
    expect(usesSun([])).toBe(false);
  });

  it('needs a location only when a rule follows the sun', () => {
    expect(placeStatusFor(NO_LOCATION, 'Europe/Paris', [SUN])).toEqual({ kind: 'no-location' });
    expect(placeStatusFor(NO_LOCATION, 'Europe/Paris', [CLOCK])).toEqual({ kind: 'ok' });
  });

  it('is invalid when the home place cannot be used', () => {
    expect(placeStatusFor({ usable: false, problem: 'bad' }, 'UTC', [SUN])).toEqual({
      kind: 'invalid',
    });
  });

  it('warns when the device is in another time zone than the home', () => {
    expect(placeStatusFor(NO_LOCATION, 'America/New_York', [CLOCK])).toEqual({
      kind: 'zone-differs',
      home: 'Europe/Paris',
      device: 'America/New_York',
    });
  });
});
