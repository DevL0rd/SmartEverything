import type { JsonValue } from '../values';
import { WET_KINDS, weatherKindOf, weatherLabelOf } from './conditions';
import type { WeatherForecast } from './forecast';
import {
  RAIN_HORIZONS,
  RAIN_HORIZON_MINUTES,
  WEATHER_BAND_METRICS,
  WEATHER_SIGNAL_METRICS,
  weatherBandOf,
  weatherSignalValue,
  type RainHorizon,
} from './signal-metrics';

export const WEATHER_SIGNAL_KINDS = [
  'changed',
  'band',
  'condition',
  'rain_started',
  'rain_stopped',
  'rain_expected',
] as const;

export type WeatherSignalKind = (typeof WEATHER_SIGNAL_KINDS)[number];

export interface WeatherSignal {
  readonly kind: WeatherSignalKind;
  readonly field: string | null;
  readonly value: JsonValue;
  readonly previous: JsonValue | null;
  readonly data: Readonly<Record<string, JsonValue>>;
}

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const WET_MM = 0.1;
const WET_CHANCE = 50;

export function isPrecipitating(forecast: WeatherForecast): boolean {
  return forecast.now.precipitationMm > 0 || WET_KINDS.has(weatherKindOf(forecast.now.code));
}

export function minutesUntilRain(forecast: WeatherForecast): number | null {
  const now = Date.parse(forecast.now.at);
  const wet = forecast.hourly.find(
    (hour) =>
      Date.parse(hour.at) > now &&
      (hour.precipitationMm >= WET_MM || (hour.precipitationChance ?? 0) >= WET_CHANCE),
  );
  if (wet === undefined) return null;
  return Math.max(0, Math.round((Date.parse(wet.at) - HOUR_MS - now) / MINUTE_MS));
}

function rainWithin(forecast: WeatherForecast, horizon: RainHorizon): boolean {
  const minutes = minutesUntilRain(forecast);
  return !isPrecipitating(forecast) && minutes !== null && minutes <= RAIN_HORIZON_MINUTES[horizon];
}

function changedSignals(previous: WeatherForecast, next: WeatherForecast): WeatherSignal[] {
  return WEATHER_SIGNAL_METRICS.flatMap((metric): WeatherSignal[] => {
    const value = weatherSignalValue(next, metric);
    const before = weatherSignalValue(previous, metric);
    return value === null || value === before
      ? []
      : [{ kind: 'changed', field: metric, value, previous: before, data: {} }];
  });
}

function bandSignals(previous: WeatherForecast, next: WeatherForecast): WeatherSignal[] {
  return WEATHER_BAND_METRICS.flatMap((metric): WeatherSignal[] => {
    const to = weatherBandOf(next, metric);
    const from = weatherBandOf(previous, metric);
    if (to === null || to === from) return [];
    const data = from === null ? { to } : { to, from };
    return [{ kind: 'band', field: metric, value: to, previous: from, data }];
  });
}

function conditionSignals(previous: WeatherForecast, next: WeatherForecast): WeatherSignal[] {
  const to = weatherKindOf(next.now.code);
  const from = weatherKindOf(previous.now.code);
  if (to === from) return [];
  const data = { to, from, code: next.now.code, label: weatherLabelOf(next.now.code) };
  return [{ kind: 'condition', field: null, value: to, previous: from, data }];
}

function rainSignals(previous: WeatherForecast, next: WeatherForecast): WeatherSignal[] {
  const wet = isPrecipitating(next);
  if (wet === isPrecipitating(previous)) return [];
  const data = {
    kind: weatherKindOf(next.now.code),
    precipitationMm: next.now.precipitationMm,
  };
  const kind = wet ? 'rain_started' : 'rain_stopped';
  return [{ kind, field: null, value: wet, previous: !wet, data }];
}

function expectedSignals(previous: WeatherForecast, next: WeatherForecast): WeatherSignal[] {
  const minutes = minutesUntilRain(next);
  if (minutes === null) return [];
  return RAIN_HORIZONS.filter(
    (horizon) => rainWithin(next, horizon) && !rainWithin(previous, horizon),
  ).map((within): WeatherSignal => ({
    kind: 'rain_expected',
    field: null,
    value: minutes,
    previous: null,
    data: { within, inMinutes: minutes },
  }));
}

export function weatherSignalsBetween(
  previous: WeatherForecast,
  next: WeatherForecast,
): readonly WeatherSignal[] {
  return [
    ...rainSignals(previous, next),
    ...expectedSignals(previous, next),
    ...conditionSignals(previous, next),
    ...bandSignals(previous, next),
    ...changedSignals(previous, next),
  ];
}
