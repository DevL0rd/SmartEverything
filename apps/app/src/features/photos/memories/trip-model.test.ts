import { describe, expect, it } from 'vitest';
import { TRIP, type Trip } from '@smarteverything/domain';
import { tripBars, tripBarsLabel, tripFigures, tripLines, tripWhen } from './trip-model';

const JAPAN: Trip = TRIP.parse({
  id: 'trip:2025-04-12',
  kind: 'trip',
  from: '2025-04-12',
  to: '2025-04-15',
  count: 1906,
  coverItemId: '0b9f8a4e-0000-4000-8000-000000000001',
  placeId: 7,
  placeName: 'Japan',
  distanceFromHomeKm: 9349.6,
  places: 9,
  perDay: [
    { day: '2025-04-12', count: 800 },
    { day: '2025-04-13', count: 0 },
    { day: '2025-04-14', count: 600 },
    { day: '2025-04-15', count: 506 },
  ],
});

const NO_HOME: Trip = { ...JAPAN, distanceFromHomeKm: null };

describe('trip figures', () => {
  it('shows days, items, places and km from home when the home has an address', () => {
    expect(tripFigures(JAPAN)).toEqual([
      { key: 'days', value: '4', label: 'days' },
      { key: 'items', value: '1,906', label: 'items' },
      { key: 'places', value: '9', label: 'places' },
      { key: 'km', value: '9,350', label: 'km from home' },
    ]);
  });

  it('hides km from home when the home has no address', () => {
    expect(tripFigures(NO_HOME).map((figure) => figure.key)).toEqual(['days', 'items', 'places']);
  });

  it('uses the singular for one place', () => {
    expect(tripFigures({ ...NO_HOME, places: 1 })[2]).toEqual({
      key: 'places',
      value: '1',
      label: 'place',
    });
  });
});

describe('trip lines on the phone', () => {
  it('puts the month, length and items first, then places and distance', () => {
    expect(tripWhen(JAPAN)).toBe('Apr 2025');
    expect(tripLines(JAPAN)).toEqual([
      'Apr 2025 · 4 days · 1,906 items',
      '9 places · 9,350 km from home',
    ]);
  });

  it('leaves the distance out when the home has no address', () => {
    expect(tripLines(NO_HOME)[1]).toBe('9 places');
  });
});

describe('photos per day', () => {
  it('draws one bar per day of the trip, empty days included', () => {
    expect(tripBars(JAPAN)).toEqual([
      { key: '2025-04-12', value: 800 },
      { key: '2025-04-13', value: 0 },
      { key: '2025-04-14', value: 600 },
      { key: '2025-04-15', value: 506 },
    ]);
    expect(tripBarsLabel(JAPAN)).toBe('Photos and videos per day of Japan');
  });
});
