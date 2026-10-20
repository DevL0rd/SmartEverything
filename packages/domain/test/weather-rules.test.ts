import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { WEATHER_FORECAST, weatherMetricValue, type GeoPoint, type WeatherForecast } from '../src';
import {
  WEATHER_CONDITIONS,
  WEATHER_TRIGGERS,
  weatherConditionHolds,
  weatherTriggerFires,
  type WeatherCondition,
  type WeatherTrigger,
} from '../src/weather/rules';

const BERLIN = { latitude: 52.52, longitude: 13.405 };

function forecast(temperatureC: number, code: number, chance = 10): WeatherForecast {
  const hour = (offset: number): unknown => ({
    at: new Date(Date.parse('2026-10-08T12:00:00Z') + offset * 3_600_000).toISOString(),
    temperatureC,
    feelsLikeC: temperatureC,
    humidityPercent: 50,
    precipitationChance: chance,
    precipitationMm: 0,
    code,
    windKmh: 10,
    uvIndex: 3,
    isDay: true,
  });
  return WEATHER_FORECAST.parse({
    latitude: 52.52,
    longitude: 13.405,
    timeZone: 'UTC',
    now: {
      at: '2026-10-08T12:00:00.000Z',
      temperatureC,
      feelsLikeC: temperatureC,
      humidityPercent: 50,
      dewPointC: 5,
      precipitationMm: 0,
      code,
      isDay: true,
      cloudPercent: 20,
      pressureHpa: 1015,
      windKmh: 10,
      windDirection: 90,
      gustKmh: 20,
      uvIndex: 3,
      visibilityM: 10_000,
    },
    hourly: [hour(0), hour(1), hour(2), hour(3)],
    daily: [
      {
        day: '2026-10-08',
        code,
        nightCode: code,
        minC: temperatureC - 3,
        maxC: temperatureC + 3,
        sunrise: '2026-10-08T05:00:00.000Z',
        sunset: '2026-10-08T17:00:00.000Z',
        daylightSeconds: 43_200,
        uvMax: 4,
        precipitationMm: 0,
        precipitationChance: 10,
        windMaxKmh: 15,
        gustMaxKmh: 25,
        windDirection: 90,
      },
    ],
    air: null,
  });
}

interface Overrides {
  readonly forecast?: WeatherForecast | null;
  readonly now?: Date;
  readonly location?: GeoPoint | null;
}

function context(overrides: Overrides = {}): {
  readonly timeZone: string;
  readonly now: Date;
  readonly forecast: WeatherForecast | null;
  readonly location: GeoPoint | null;
} {
  const {
    forecast = forecast20(),
    location = BERLIN,
    now = new Date('2026-10-08T12:00:00Z'),
  } = overrides;
  return { timeZone: 'UTC', now, forecast, location };
}

function forecast20(): WeatherForecast {
  return forecast(20, 0);
}

const CONDITION = z.discriminatedUnion('type', WEATHER_CONDITIONS);
const TRIGGER = z.discriminatedUnion('type', WEATHER_TRIGGERS);

function condition(item: unknown): WeatherCondition {
  return CONDITION.parse(item);
}

describe('weather and daylight conditions', () => {
  it('compares a weather metric of the latest forecast and never holds without one', () => {
    const cold = condition({
      type: 'weather',
      metric: 'temperature',
      comparison: { operator: 'lt', value: 5 },
    });
    expect(weatherConditionHolds(cold, context({ forecast: forecast(2, 0) }))).toBe(true);
    expect(weatherConditionHolds(cold, context({ forecast: forecast(8, 0) }))).toBe(false);
    expect(weatherConditionHolds(cold, context({ forecast: null }))).toBe(false);
  });

  it('uses the highest chance of rain in the next three hours', () => {
    const wet = condition({
      type: 'weather',
      metric: 'rain_chance',
      comparison: { operator: 'gte', value: 60 },
    });
    expect(weatherConditionHolds(wet, context({ forecast: forecast(10, 3, 70) }))).toBe(true);
    expect(weatherConditionHolds(wet, context({ forecast: forecast(10, 3, 30) }))).toBe(false);
  });

  it('holds when the kind of weather is one of the named kinds', () => {
    const rainy = condition({ type: 'weather_kind', kinds: ['rain', 'storm'] });
    expect(weatherConditionHolds(rainy, context({ forecast: forecast(10, 63) }))).toBe(true);
    expect(weatherConditionHolds(rainy, context({ forecast: forecast(10, 95) }))).toBe(true);
    expect(weatherConditionHolds(rainy, context({ forecast: forecast(10, 0) }))).toBe(false);
  });

  it('tells day from night at the location and moves the edges by the offsets', () => {
    const day = (offset: number): WeatherCondition =>
      condition({
        type: 'daylight',
        is: 'day',
        sunriseOffsetMinutes: 0,
        sunsetOffsetMinutes: offset,
      });
    const at = (iso: string): ReturnType<typeof context> => context({ now: new Date(iso) });
    expect(weatherConditionHolds(day(0), at('2026-10-08T12:00:00Z'))).toBe(true);
    expect(weatherConditionHolds(day(0), at('2026-10-08T23:00:00Z'))).toBe(false);
    expect(weatherConditionHolds(day(0), at('2026-10-08T17:00:00Z'))).toBe(false);
    expect(weatherConditionHolds(day(180), at('2026-10-08T17:00:00Z'))).toBe(true);
    const night = condition({
      type: 'daylight',
      is: 'night',
      sunriseOffsetMinutes: 0,
      sunsetOffsetMinutes: 0,
    });
    expect(weatherConditionHolds(night, at('2026-10-08T23:00:00Z'))).toBe(true);
  });

  it('holds for neither day nor night when the home has no location', () => {
    const noLocation = context({ location: null });
    const day = condition({
      type: 'daylight',
      is: 'day',
      sunriseOffsetMinutes: 0,
      sunsetOffsetMinutes: 0,
    });
    const night = condition({
      type: 'daylight',
      is: 'night',
      sunriseOffsetMinutes: 0,
      sunsetOffsetMinutes: 0,
    });
    expect([
      weatherConditionHolds(day, noLocation),
      weatherConditionHolds(night, noLocation),
    ]).toStrictEqual([false, false]);
  });
});

describe('weather triggers fire on entering the rule', () => {
  const metric: WeatherTrigger = TRIGGER.parse({
    type: 'weather',
    metric: 'temperature',
    comparison: { operator: 'gt', value: 25 },
  });
  const kind: WeatherTrigger = TRIGGER.parse({ type: 'weather_kind', kinds: ['rain'] });

  it('fires when the metric turns true after being false or unknown', () => {
    expect(weatherTriggerFires(metric, forecast(20, 0), forecast(30, 0))).toBe(true);
    expect(weatherTriggerFires(metric, null, forecast(30, 0))).toBe(true);
  });

  it('does not fire while the metric stays true or stays false', () => {
    expect(weatherTriggerFires(metric, forecast(30, 0), forecast(31, 0))).toBe(false);
    expect(weatherTriggerFires(metric, forecast(20, 0), forecast(21, 0))).toBe(false);
    expect(weatherTriggerFires(metric, forecast(30, 0), forecast(20, 0))).toBe(false);
  });

  it('fires when the weather turns to one of the named kinds', () => {
    expect(weatherTriggerFires(kind, forecast(10, 3), forecast(10, 63))).toBe(true);
    expect(weatherTriggerFires(kind, forecast(10, 63), forecast(10, 65))).toBe(false);
    expect(weatherTriggerFires(kind, forecast(10, 63), forecast(10, 0))).toBe(false);
  });
});

describe('weather metrics', () => {
  it('reads each metric from the latest forecast', () => {
    const now = forecast(20, 0);
    expect(weatherMetricValue(now, 'temperature')).toBe(20);
    expect(weatherMetricValue(now, 'feels_like')).toBe(20);
    expect(weatherMetricValue(now, 'humidity')).toBe(50);
    expect(weatherMetricValue(now, 'wind_speed')).toBe(10);
    expect(weatherMetricValue(now, 'precipitation')).toBe(0);
    expect(weatherMetricValue(now, 'uv_index')).toBe(3);
    expect(weatherMetricValue(null, 'temperature')).toBeNull();
  });

  it('has no air metrics when the forecast has no air data', () => {
    const now = forecast(20, 0);
    expect(weatherMetricValue(now, 'aqi')).toBeNull();
    expect(weatherMetricValue(now, 'pm25')).toBeNull();
  });

  it('reads air metrics when the forecast carries them', () => {
    const base = forecast(20, 0);
    const withAir = WEATHER_FORECAST.parse({
      ...base,
      air: {
        now: {
          at: '2026-10-08T12:00:00.000Z',
          usAqi: 42,
          europeanAqi: null,
          pm25: 9.5,
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
      },
    });
    expect(weatherMetricValue(withAir, 'aqi')).toBe(42);
    expect(weatherMetricValue(withAir, 'pm25')).toBe(9.5);
  });

  it('has no rain chance when no hour after now reports one', () => {
    const base = forecast(20, 0);
    expect(weatherMetricValue({ ...base, hourly: [] }, 'rain_chance')).toBeNull();
    const unknownChance = base.hourly.map((hour) => ({ ...hour, precipitationChance: null }));
    expect(weatherMetricValue({ ...base, hourly: unknownChance }, 'rain_chance')).toBeNull();
  });

  it('holds neither day nor night where the sun does not rise or set', () => {
    const polar = context({
      location: { latitude: 89, longitude: 0 },
      now: new Date('2026-06-21T12:00:00Z'),
    });
    const day = condition({
      type: 'daylight',
      is: 'day',
      sunriseOffsetMinutes: 0,
      sunsetOffsetMinutes: 0,
    });
    const night = condition({
      type: 'daylight',
      is: 'night',
      sunriseOffsetMinutes: 0,
      sunsetOffsetMinutes: 0,
    });
    expect([weatherConditionHolds(day, polar), weatherConditionHolds(night, polar)]).toStrictEqual([
      false,
      false,
    ]);
  });
});
