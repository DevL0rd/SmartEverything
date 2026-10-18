import fc from 'fast-check';
import { WEATHER_FORECAST, type WeatherForecast } from '../../src/weather/forecast';
import type { ConditionContext } from '../../src/automations';
import type { ContextV2 } from '../../src/automation-v2-eval';
import { CONTROLS, DEVICES, INPUT_NAMES, VALUES } from './automation-v2-arbitraries';

export const BERLIN = { latitude: 52.52, longitude: 13.405 };

export interface World {
  readonly states: Readonly<Record<string, number>>;
  readonly values: Readonly<Record<string, number>>;
  readonly inputs: Readonly<Record<string, number>>;
  readonly minute: number;
  readonly temperature: number;
  readonly code: number;
}

const reading = fc.integer({ min: 0, max: 100 });

export const world: fc.Arbitrary<World> = fc.record({
  states: fc
    .tuple(...DEVICES.flatMap(() => CONTROLS.map(() => reading)))
    .map((readings) =>
      Object.fromEntries(
        DEVICES.flatMap((device) => CONTROLS.map((control) => `${device}|${control}`)).map(
          (key, index) => [key, readings[index] ?? 0],
        ),
      ),
    ),
  values: fc.tuple(reading, reading).map(([a, b]) => ({ [VALUES[0]]: a, [VALUES[1]]: b })),
  inputs: fc
    .tuple(reading, reading)
    .map(([a, b]) => ({ [INPUT_NAMES[0]]: a, [INPUT_NAMES[1]]: b })),
  minute: fc.integer({ min: 0, max: 1439 }),
  temperature: fc.integer({ min: -5, max: 40 }),
  code: fc.constantFrom(0, 3, 61, 71, 95),
});

function dayOf(temperatureC: number, code: number): unknown {
  return {
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
  };
}

function hourOf(temperatureC: number, code: number, offset: number): unknown {
  return {
    at: new Date(Date.parse('2026-10-08T12:00:00Z') + offset * 3_600_000).toISOString(),
    temperatureC,
    feelsLikeC: temperatureC,
    humidityPercent: 50,
    precipitationChance: 10,
    precipitationMm: 0,
    code,
    windKmh: 10,
    uvIndex: 3,
    isDay: true,
  };
}

export function forecastOf(temperatureC: number, code: number): WeatherForecast {
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
    hourly: [0, 1, 2, 3].map((offset) => hourOf(temperatureC, code, offset)),
    daily: [dayOf(temperatureC, code)],
    air: null,
  });
}

export interface Readings {
  readonly state: (device: string, control: string) => number | undefined;
  readonly value: (id: string) => number;
  readonly input: (name: string) => number;
  readonly minute: number;
  readonly temperature: number;
  readonly code: number;
}

export function readingsOf(sample: World): Readings {
  return {
    state: (device, control) => sample.states[`${device}|${control}`],
    value: (id) => sample.values[id] ?? 0,
    input: (name) => sample.inputs[name] ?? 0,
    minute: sample.minute,
    temperature: sample.temperature,
    code: sample.code,
  };
}

function instantOf(minute: number): Date {
  return new Date(Date.UTC(2026, 9, 8, 0, minute));
}

export function contextV1(readings: Readings): ConditionContext {
  return {
    stateOf: readings.state,
    valueOf: readings.value,
    bindings: {
      value: readings.value,
      parameter: readings.input,
      capability: (device, control) => readings.state(device, control) ?? 0,
    },
    now: instantOf(readings.minute),
    timeZone: 'UTC',
    forecast: forecastOf(readings.temperature, readings.code),
    location: BERLIN,
  };
}

export function contextV2(readings: Readings): ContextV2 {
  return {
    read: { device: readings.state, value: readings.value, input: readings.input },
    now: instantOf(readings.minute),
    timeZone: 'UTC',
    forecast: forecastOf(readings.temperature, readings.code),
    location: BERLIN,
  };
}
