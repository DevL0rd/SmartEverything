import { describe, expect, it } from 'vitest';
import {
  UnknownWeatherCodeError,
  WEATHER_STALE_MS,
  isWeatherCode,
  uvBandOf,
  usAqiVerdict,
  weatherKindOf,
  weatherLabelOf,
  weatherStatusOf,
  worseWeatherCode,
} from '../src/weather/conditions';
import type { WeatherRow } from '../src/weather/forecast';
import { WEATHER_FORECAST } from '../src/weather/forecast';

const NOW = new Date('2026-10-08T12:00:00.000Z');
const PLACE = { latitude: 52.5, longitude: 13.4 };

function forecast(): NonNullable<WeatherRow['forecast']> {
  return WEATHER_FORECAST.parse({
    latitude: 52.5,
    longitude: 13.4,
    timeZone: 'UTC',
    now: {
      at: '2026-10-08T12:00:00.000Z',
      temperatureC: 10,
      feelsLikeC: 9,
      humidityPercent: 50,
      dewPointC: null,
      precipitationMm: 0,
      code: 1,
      isDay: true,
      cloudPercent: null,
      pressureHpa: null,
      windKmh: 5,
      windDirection: null,
      gustKmh: null,
      uvIndex: null,
      visibilityM: null,
    },
    hourly: [],
    daily: [
      {
        day: '2026-10-08',
        code: 1,
        nightCode: 1,
        minC: 4,
        maxC: 12,
        sunrise: null,
        sunset: null,
        daylightSeconds: null,
        uvMax: null,
        precipitationMm: 0,
        precipitationChance: null,
        windMaxKmh: 8,
        gustMaxKmh: null,
        windDirection: null,
      },
    ],
    air: null,
  });
}

function row(overrides: Partial<WeatherRow>): WeatherRow {
  return {
    id: 'home',
    forecast: null,
    fetched_at: null,
    next_fetch_at: null,
    error: null,
    air_error: null,
    failed_at: null,
    updated_at: '2026-10-08T12:00:00.000Z',
    ...overrides,
  };
}

describe('weather codes', () => {
  it('maps a code to its kind and label', () => {
    expect(weatherKindOf(65)).toBe('rain');
    expect(weatherLabelOf(65)).toBe('Heavy rain');
    expect(weatherKindOf(96)).toBe('storm');
  });

  it('knows which numbers are weather codes', () => {
    expect(isWeatherCode(45)).toBe(true);
    expect(isWeatherCode(4)).toBe(false);
  });

  it('names the code it does not know', () => {
    expect(() => weatherKindOf(4)).toThrow(UnknownWeatherCodeError);
    expect(() => weatherLabelOf(4)).toThrow('The weather code 4 is not a WMO weather code');
  });

  it('picks the worse of two codes by kind first, then by code', () => {
    expect(worseWeatherCode(3, 61)).toBe(61);
    expect(worseWeatherCode(95, 71)).toBe(95);
    expect(worseWeatherCode(61, 63)).toBe(63);
    expect(worseWeatherCode(63, 63)).toBe(63);
  });
});

describe('air quality verdict', () => {
  it('bands the US index by its upper limits', () => {
    expect(usAqiVerdict(50)).toStrictEqual({ band: 'good', label: 'Good' });
    expect(usAqiVerdict(51)).toStrictEqual({ band: 'fair', label: 'Moderate' });
    expect(usAqiVerdict(300)).toStrictEqual({ band: 'bad', label: 'Very unhealthy' });
  });

  it('calls anything above the last band hazardous', () => {
    expect(usAqiVerdict(301)).toStrictEqual({ band: 'severe', label: 'Hazardous' });
  });
});

describe('uv band', () => {
  it.each([
    [0, 'low'],
    [2.4, 'low'],
    [2.5, 'moderate'],
    [5, 'moderate'],
    [7, 'high'],
    [10, 'very_high'],
    [11, 'extreme'],
  ] as const)('puts index %s in %s', (index, band) => {
    expect(uvBandOf(index)).toBe(band);
  });
});

describe('weatherStatusOf', () => {
  it('needs a place with both coordinates', () => {
    expect(weatherStatusOf(row({}), { latitude: null, longitude: 13.4 }, NOW)).toStrictEqual({
      kind: 'no_location',
    });
    expect(weatherStatusOf(row({}), { latitude: 52.5, longitude: null }, NOW)).toStrictEqual({
      kind: 'no_location',
    });
  });

  it('is loading until a forecast arrives, or failed when the fetch reported an error', () => {
    expect(weatherStatusOf(row({}), PLACE, NOW)).toStrictEqual({ kind: 'loading' });
    expect(weatherStatusOf(row({ error: 'offline' }), PLACE, NOW)).toStrictEqual({
      kind: 'failed',
      reason: 'offline',
    });
  });

  it('is ready and fresh within the stale window, keeping a later problem', () => {
    const fetched = new Date(NOW.getTime() - WEATHER_STALE_MS).toISOString();
    expect(
      weatherStatusOf(
        row({ forecast: forecast(), fetched_at: fetched, error: 'air down' }),
        PLACE,
        NOW,
      ),
    ).toStrictEqual({ kind: 'ready', stale: false, problem: 'air down' });
  });

  it('is stale once older than the window', () => {
    const fetched = new Date(NOW.getTime() - WEATHER_STALE_MS - 1).toISOString();
    expect(
      weatherStatusOf(row({ forecast: forecast(), fetched_at: fetched }), PLACE, NOW),
    ).toStrictEqual({ kind: 'ready', stale: true, problem: null });
  });
});
