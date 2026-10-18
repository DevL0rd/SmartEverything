import { describe, expect, it } from 'vitest';
import {
  AUTOMATION_VALUE_ID,
  CONDITIONS,
  TRIGGER,
  WEATHER_FORECAST,
  conditionsHold,
  weatherChangeFires,
  type AutomationBindingContext,
  type ConditionContext,
  type GeoPoint,
  type JsonValue,
  type Conditions,
  type WeatherForecast,
} from '../src';

const VALUE_ID = AUTOMATION_VALUE_ID.parse('3a000000-0000-4000-8000-000000000001');
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
  readonly bindings?: AutomationBindingContext;
  readonly values?: (id: string) => JsonValue;
  readonly forecast?: WeatherForecast | null;
  readonly now?: Date;
  readonly location?: GeoPoint | null;
}

function context(overrides: Overrides = {}): ConditionContext {
  const {
    forecast = forecast20(),
    location = BERLIN,
    now = new Date('2026-10-08T12:00:00Z'),
  } = overrides;
  return {
    stateOf: () => undefined,
    timeZone: 'UTC',
    now,
    forecast,
    location,
    ...(overrides.bindings === undefined ? {} : { bindings: overrides.bindings }),
    ...(overrides.values === undefined ? {} : { valueOf: overrides.values }),
  };
}

function forecast20(): WeatherForecast {
  return forecast(20, 0);
}

function all(...items: unknown[]): Conditions {
  return CONDITIONS.parse({ mode: 'all', items });
}

describe('C10 Value and device-reading conditions', () => {
  it('compares a Value through the Value reader', () => {
    const condition = all({
      type: 'value',
      valueId: VALUE_ID,
      comparison: { operator: 'gte', value: 5 },
    });
    expect(conditionsHold(condition, context({ values: () => 7 }))).toBe(true);
    expect(conditionsHold(condition, context({ values: () => 4 }))).toBe(false);
  });

  it('compares a live reading resolved from an input', () => {
    const condition = all({
      type: 'binding',
      input: { binding: { source: 'parameter', kind: 'number', name: 'level' } },
      comparison: { operator: 'between', min: 10, max: 20 },
    });
    const reading = (value: number): ConditionContext =>
      context({
        bindings: { value: () => 0, parameter: () => value, capability: () => 0 },
      });
    expect([10, 20, 21, 9].map((value) => conditionsHold(condition, reading(value)))).toStrictEqual(
      [true, true, false, false],
    );
  });
});

describe('C10 weather and daylight conditions', () => {
  it('compares a weather metric of the latest forecast and never holds without one', () => {
    const cold = all({
      type: 'weather',
      metric: 'temperature',
      comparison: { operator: 'lt', value: 5 },
    });
    expect(conditionsHold(cold, context({ forecast: forecast(2, 0) }))).toBe(true);
    expect(conditionsHold(cold, context({ forecast: forecast(8, 0) }))).toBe(false);
    expect(conditionsHold(cold, context({ forecast: null }))).toBe(false);
  });

  it('uses the highest chance of rain in the next three hours', () => {
    const wet = all({
      type: 'weather',
      metric: 'rain_chance',
      comparison: { operator: 'gte', value: 60 },
    });
    expect(conditionsHold(wet, context({ forecast: forecast(10, 3, 70) }))).toBe(true);
    expect(conditionsHold(wet, context({ forecast: forecast(10, 3, 30) }))).toBe(false);
  });

  it('holds when the kind of weather is one of the named kinds', () => {
    const rainy = all({ type: 'weather_kind', kinds: ['rain', 'storm'] });
    expect(conditionsHold(rainy, context({ forecast: forecast(10, 63) }))).toBe(true);
    expect(conditionsHold(rainy, context({ forecast: forecast(10, 95) }))).toBe(true);
    expect(conditionsHold(rainy, context({ forecast: forecast(10, 0) }))).toBe(false);
  });

  it('tells day from night at the location and moves the edges by the offsets', () => {
    const day = (offset: number): Conditions =>
      all({ type: 'daylight', is: 'day', sunriseOffsetMinutes: 0, sunsetOffsetMinutes: offset });
    const at = (iso: string): ConditionContext => context({ now: new Date(iso) });
    expect(conditionsHold(day(0), at('2026-10-08T12:00:00Z'))).toBe(true);
    expect(conditionsHold(day(0), at('2026-10-08T23:00:00Z'))).toBe(false);
    expect(conditionsHold(day(0), at('2026-10-08T17:00:00Z'))).toBe(false);
    expect(conditionsHold(day(180), at('2026-10-08T17:00:00Z'))).toBe(true);
    const night = all({
      type: 'daylight',
      is: 'night',
      sunriseOffsetMinutes: 0,
      sunsetOffsetMinutes: 0,
    });
    expect(conditionsHold(night, at('2026-10-08T23:00:00Z'))).toBe(true);
  });

  it('holds for neither day nor night when the home has no location', () => {
    const noLocation = context({ location: null });
    const day = all({
      type: 'daylight',
      is: 'day',
      sunriseOffsetMinutes: 0,
      sunsetOffsetMinutes: 0,
    });
    const night = all({
      type: 'daylight',
      is: 'night',
      sunriseOffsetMinutes: 0,
      sunsetOffsetMinutes: 0,
    });
    expect([conditionsHold(day, noLocation), conditionsHold(night, noLocation)]).toStrictEqual([
      false,
      false,
    ]);
  });
});

describe('C8 weather triggers fire on entering the rule', () => {
  const metric = TRIGGER.parse({
    type: 'weather',
    metric: 'temperature',
    comparison: { operator: 'gt', value: 25 },
  });
  const kind = TRIGGER.parse({ type: 'weather_kind', kinds: ['rain'] });

  it('fires when the metric turns true after being false or unknown', () => {
    expect(weatherChangeFires(metric, forecast(20, 0), forecast(30, 0))).toBe(true);
    expect(weatherChangeFires(metric, null, forecast(30, 0))).toBe(true);
  });

  it('does not fire while the metric stays true or stays false', () => {
    expect(weatherChangeFires(metric, forecast(30, 0), forecast(31, 0))).toBe(false);
    expect(weatherChangeFires(metric, forecast(20, 0), forecast(21, 0))).toBe(false);
    expect(weatherChangeFires(metric, forecast(30, 0), forecast(20, 0))).toBe(false);
  });

  it('fires when the weather turns to one of the named kinds', () => {
    expect(weatherChangeFires(kind, forecast(10, 3), forecast(10, 63))).toBe(true);
    expect(weatherChangeFires(kind, forecast(10, 63), forecast(10, 65))).toBe(false);
    expect(weatherChangeFires(kind, forecast(10, 63), forecast(10, 0))).toBe(false);
  });
});
