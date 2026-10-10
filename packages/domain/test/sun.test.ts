import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { GEO_POINT, nextSunEvent, sunEventOn } from '../src';

const LONDON = { latitude: 51.5074, longitude: -0.1278 };
const SYDNEY = { latitude: -33.8688, longitude: 151.2093 };
const NORTHERN_NORWAY = { latitude: 69.6492, longitude: 18.9553 };
const QUITO = { latitude: -0.1807, longitude: -78.4678 };

function minutesBetween(left: Date | null, right: string): number {
  if (left === null) {
    throw new Error('expected a time');
  }
  return Math.abs(left.getTime() - new Date(right).getTime()) / 60_000;
}

describe('sunEventOn', () => {
  it('matches the NOAA calculator for London at the summer solstice within two minutes', () => {
    const date = { year: 2024, month: 6, day: 21 };
    expect(
      minutesBetween(sunEventOn('sunrise', date, LONDON), '2024-06-21T03:43:00Z'),
    ).toBeLessThan(2);
    expect(minutesBetween(sunEventOn('sunset', date, LONDON), '2024-06-21T20:21:00Z')).toBeLessThan(
      2,
    );
  });

  it('matches the NOAA calculator for Sydney in December within two minutes', () => {
    const date = { year: 2024, month: 12, day: 21 };
    expect(
      minutesBetween(sunEventOn('sunrise', date, SYDNEY), '2024-12-20T18:41:00Z'),
    ).toBeLessThan(2);
    expect(minutesBetween(sunEventOn('sunset', date, SYDNEY), '2024-12-21T09:05:00Z')).toBeLessThan(
      2,
    );
  });

  it('computes exactly the same instants every time for fixed inputs', () => {
    expect(sunEventOn('sunrise', { year: 2024, month: 6, day: 21 }, LONDON)?.toISOString()).toBe(
      '2024-06-21T03:42:39.527Z',
    );
    expect(sunEventOn('sunset', { year: 2024, month: 6, day: 21 }, LONDON)?.toISOString()).toBe(
      '2024-06-21T20:21:15.148Z',
    );
    expect(sunEventOn('sunrise', { year: 2024, month: 12, day: 21 }, SYDNEY)?.toISOString()).toBe(
      '2024-12-20T18:40:48.932Z',
    );
    expect(sunEventOn('sunset', { year: 2023, month: 3, day: 1 }, QUITO)?.toISOString()).toBe(
      '2023-03-01T23:30:14.265Z',
    );
    expect(
      sunEventOn('sunrise', { year: 2025, month: 9, day: 30 }, NORTHERN_NORWAY)?.toISOString(),
    ).toBe('2025-09-30T04:51:12.060Z');
  });

  it('reports no sunrise during the polar night and no sunset under the midnight sun', () => {
    expect(sunEventOn('sunrise', { year: 2024, month: 12, day: 21 }, NORTHERN_NORWAY)).toBeNull();
    expect(sunEventOn('sunset', { year: 2024, month: 6, day: 21 }, NORTHERN_NORWAY)).toBeNull();
  });

  it('always places sunrise before sunset on the same day away from the poles', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -60, max: 60, noNaN: true }),
        fc.double({ min: -180, max: 180, noNaN: true }),
        fc.integer({ min: 1, max: 365 }),
        (latitude, longitude, dayOfYear) => {
          const date = { year: 2023, month: 1, day: dayOfYear };
          const sunrise = sunEventOn('sunrise', date, { latitude, longitude });
          const sunset = sunEventOn('sunset', date, { latitude, longitude });
          expect(sunrise).not.toBeNull();
          expect(sunset).not.toBeNull();
          expect((sunrise?.getTime() ?? 0) < (sunset?.getTime() ?? 0)).toBe(true);
        },
      ),
    );
  });
});

describe('nextSunEvent', () => {
  const sunset = { event: 'sunset' as const, offsetMinutes: 0, point: LONDON };

  it('returns the same day sunset when it is still ahead', () => {
    expect(nextSunEvent(sunset, new Date('2024-06-21T12:00:00Z'))?.toISOString()).toBe(
      '2024-06-21T20:21:15.148Z',
    );
  });

  it('moves to the next day once the sunset has passed, including the exact instant', () => {
    const next = nextSunEvent(sunset, new Date('2024-06-21T20:21:15.148Z'));
    expect(next?.toISOString().slice(0, 10)).toBe('2024-06-22');
  });

  it('applies a positive offset in minutes', () => {
    const shifted = nextSunEvent(
      { ...sunset, offsetMinutes: 30 },
      new Date('2024-06-21T12:00:00Z'),
    );
    expect(shifted?.toISOString()).toBe('2024-06-21T20:51:15.148Z');
  });

  it('finds an event belonging to the next UTC day when a negative offset pulls it before midnight', () => {
    const early = nextSunEvent(
      { event: 'sunrise', offsetMinutes: -720, point: LONDON },
      new Date('2024-06-21T12:00:00Z'),
    );
    expect(early?.toISOString()).toBe('2024-06-21T15:42:52.694Z');
  });

  it('finds an event from the previous UTC day for places far east of Greenwich', () => {
    const next = nextSunEvent(
      { event: 'sunrise', offsetMinutes: 0, point: SYDNEY },
      new Date('2024-12-20T12:00:00Z'),
    );
    expect(next?.toISOString()).toBe('2024-12-20T18:40:48.932Z');
  });

  it('waits through the polar night for the first sunrise', () => {
    const next = nextSunEvent(
      { event: 'sunrise', offsetMinutes: 0, point: NORTHERN_NORWAY },
      new Date('2024-12-21T00:00:00Z'),
    );
    expect(next?.toISOString().slice(0, 10)).toBe('2025-01-16');
  });

  it('returns null where the sun never rises or sets within the search window', () => {
    expect(
      nextSunEvent(
        { event: 'sunrise', offsetMinutes: 0, point: { latitude: 90, longitude: 0 } },
        new Date('2024-01-01T00:00:00Z'),
      ),
    ).toBeNull();
  });
});

describe('GEO_POINT', () => {
  it('accepts the extremes and refuses anything beyond them', () => {
    expect(GEO_POINT.safeParse({ latitude: -90, longitude: 180 }).success).toBe(true);
    expect(GEO_POINT.safeParse({ latitude: 45, longitude: -180 }).success).toBe(true);
    expect(GEO_POINT.safeParse({ latitude: 90, longitude: 0 }).success).toBe(true);
    expect(GEO_POINT.safeParse({ latitude: -90.1, longitude: 0 }).success).toBe(false);
    expect(GEO_POINT.safeParse({ latitude: 0, longitude: 180.1 }).success).toBe(false);
    expect(GEO_POINT.safeParse({ latitude: 90.1, longitude: 0 }).success).toBe(false);
    expect(GEO_POINT.safeParse({ latitude: 0, longitude: -180.1 }).success).toBe(false);
  });
});
