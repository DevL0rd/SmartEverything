import { describe, expect, it } from 'vitest';
import type { WeatherForecast } from '@smarteverything/domain';
import { weatherStats } from './stats';

const NOW = Date.parse('2026-10-16T10:00:00Z');

function forecastOf(
  over: Partial<WeatherForecast> = {},
  uv: number | null = null,
): WeatherForecast {
  return {
    latitude: 0,
    longitude: 0,
    timeZone: 'UTC',
    now: {
      at: '2026-10-16T10:00:00Z',
      temperatureC: 12,
      feelsLikeC: 11,
      humidityPercent: 60,
      dewPointC: null,
      precipitationMm: 0,
      code: 0,
      isDay: true,
      cloudPercent: null,
      pressureHpa: null,
      windKmh: 10,
      windDirection: 90,
      gustKmh: null,
      uvIndex: uv,
      visibilityM: null,
    },
    hourly: [
      {
        at: '2026-10-16T10:00:00Z',
        temperatureC: 12,
        feelsLikeC: 11,
        humidityPercent: 60,
        precipitationChance: 30,
        precipitationMm: 0,
        code: 0,
        windKmh: 10,
        uvIndex: null,
        isDay: true,
      },
    ],
    daily: [
      {
        day: '2026-10-16',
        code: 0,
        nightCode: 0,
        minC: 8,
        maxC: 19,
        sunrise: null,
        sunset: null,
        daylightSeconds: null,
        uvMax: null,
        precipitationMm: 0,
        precipitationChance: null,
        windMaxKmh: 10,
        gustMaxKmh: null,
        windDirection: null,
      },
    ],
    air: null,
    ...over,
  };
}

describe('weatherStats', () => {
  it('lists the day range, the rain chance and the wind for a plain day', () => {
    const stats = weatherStats(forecastOf(), NOW);
    expect(stats.map((stat) => stat.key)).toEqual(['range', 'rain', 'wind']);
    expect(stats[0]?.value).toBe('19° · 8°');
    expect(stats[1]?.value).toBe('30%');
    expect(stats[2]?.value).toBe('10 km/h E');
  });

  it('leaves out the range when today is not in the forecast', () => {
    const stats = weatherStats(forecastOf(), Date.parse('2026-11-30T10:00:00Z'));
    expect(stats.map((stat) => stat.key)).toEqual(['rain', 'wind']);
  });

  it('shows a dash for the rain chance without hours', () => {
    const stats = weatherStats(forecastOf({ hourly: [] }), NOW);
    expect(stats.find((stat) => stat.key === 'rain')?.value).toBe('—');
  });

  it('adds UV when the index is known and air when the air index is known', () => {
    const air = {
      now: {
        at: '2026-10-16T10:00:00Z',
        usAqi: 42,
        europeanAqi: null,
        pm25: null,
        pm10: null,
        ozone: null,
        nitrogenDioxide: null,
        uvIndex: null,
        pollen: {
          alder: null,
          birch: null,
          grass: null,
          mugwort: null,
          olive: null,
          ragweed: null,
        },
      },
      hourly: [],
      daily: [],
    };
    const stats = weatherStats(forecastOf({ air }, 6), NOW);
    expect(stats.map((stat) => stat.key)).toEqual(['range', 'rain', 'wind', 'uv', 'air']);
    expect(stats.find((stat) => stat.key === 'uv')?.value).toBe('6 · High');
    expect(stats.find((stat) => stat.key === 'air')).toMatchObject({
      value: '42',
      caption: 'Good',
    });
  });
});
