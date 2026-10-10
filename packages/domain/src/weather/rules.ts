import { z } from 'zod';
import { NUMERIC_COMPARISON, compareNumber } from '../comparison';
import { sunEventOn, type GeoPoint } from '../sun';
import { localClock } from '../zoned-clock';
import { WEATHER_KINDS, weatherKindOf, type WeatherKind } from './conditions';
import type { WeatherForecast } from './forecast';

export const WEATHER_METRICS = [
  'temperature',
  'feels_like',
  'humidity',
  'wind_speed',
  'precipitation',
  'rain_chance',
  'aqi',
  'pm25',
  'uv_index',
] as const;

export type WeatherMetric = (typeof WEATHER_METRICS)[number];

export interface WeatherMetricInfo {
  readonly label: string;
  readonly unit: string | null;
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

export const WEATHER_METRIC_INFO: Readonly<Record<WeatherMetric, WeatherMetricInfo>> = {
  temperature: { label: 'Outdoor temperature', unit: '°C', min: -40, max: 55, step: 1 },
  feels_like: { label: 'Feels like', unit: '°C', min: -40, max: 60, step: 1 },
  humidity: { label: 'Outdoor humidity', unit: '%', min: 0, max: 100, step: 5 },
  wind_speed: { label: 'Wind speed', unit: 'km/h', min: 0, max: 150, step: 5 },
  precipitation: { label: 'Rainfall now', unit: 'mm', min: 0, max: 50, step: 0.5 },
  rain_chance: { label: 'Chance of rain (next 3 h)', unit: '%', min: 0, max: 100, step: 10 },
  aqi: { label: 'Outdoor air quality (US AQI)', unit: null, min: 0, max: 500, step: 10 },
  pm25: { label: 'Outdoor PM2.5', unit: 'µg/m³', min: 0, max: 500, step: 5 },
  uv_index: { label: 'UV index', unit: null, min: 0, max: 15, step: 1 },
};

const RAIN_WINDOW_HOURS = 3;

function rainChance(forecast: WeatherForecast): number | null {
  const start = Date.parse(forecast.now.at) - 3_600_000;
  const chances = forecast.hourly
    .filter((hour) => Date.parse(hour.at) > start)
    .slice(0, RAIN_WINDOW_HOURS)
    .map((hour) => hour.precipitationChance)
    .filter((chance) => chance !== null);
  return chances.length === 0 ? null : Math.max(...chances);
}

const READERS: Readonly<Record<WeatherMetric, (forecast: WeatherForecast) => number | null>> = {
  temperature: (forecast) => forecast.now.temperatureC,
  feels_like: (forecast) => forecast.now.feelsLikeC,
  humidity: (forecast) => forecast.now.humidityPercent,
  wind_speed: (forecast) => forecast.now.windKmh,
  precipitation: (forecast) => forecast.now.precipitationMm,
  rain_chance: rainChance,
  aqi: (forecast) => forecast.air?.now.usAqi ?? null,
  pm25: (forecast) => forecast.air?.now.pm25 ?? null,
  uv_index: (forecast) => forecast.now.uvIndex,
};

export function weatherMetricValue(
  forecast: WeatherForecast | null,
  metric: WeatherMetric,
): number | null {
  return forecast === null ? null : READERS[metric](forecast);
}

const METRIC = z.enum(WEATHER_METRICS);

const KINDS = z
  .array(z.enum(WEATHER_KINDS))
  .min(1)
  .refine((kinds) => new Set(kinds).size === kinds.length, { message: 'kinds must not repeat' });

export const WEATHER_TRIGGERS = [
  z.object({ type: z.literal('weather'), metric: METRIC, comparison: NUMERIC_COMPARISON }),
  z.object({ type: z.literal('weather_kind'), kinds: KINDS }),
] as const;

const OFFSET = z.number().int().min(-720).max(720);

export const WEATHER_CONDITIONS = [
  z.object({ type: z.literal('weather'), metric: METRIC, comparison: NUMERIC_COMPARISON }),
  z.object({ type: z.literal('weather_kind'), kinds: KINDS }),
  z.object({
    type: z.literal('daylight'),
    is: z.enum(['day', 'night']),
    sunriseOffsetMinutes: OFFSET,
    sunsetOffsetMinutes: OFFSET,
  }),
] as const;

export type WeatherTrigger = z.infer<(typeof WEATHER_TRIGGERS)[number]>;

export type WeatherCondition = z.infer<(typeof WEATHER_CONDITIONS)[number]>;

function holdsMetric(
  rule: Extract<WeatherTrigger, { type: 'weather' }>,
  forecast: WeatherForecast | null,
): boolean {
  const value = weatherMetricValue(forecast, rule.metric);
  return value !== null && compareNumber(rule.comparison, value);
}

function holdsKind(kinds: readonly WeatherKind[], forecast: WeatherForecast | null): boolean {
  return forecast !== null && kinds.includes(weatherKindOf(forecast.now.code));
}

function ruleHolds(rule: WeatherTrigger, forecast: WeatherForecast | null): boolean {
  return rule.type === 'weather' ? holdsMetric(rule, forecast) : holdsKind(rule.kinds, forecast);
}

export function weatherTriggerFires(
  trigger: WeatherTrigger,
  previous: WeatherForecast | null,
  next: WeatherForecast,
): boolean {
  return ruleHolds(trigger, next) && !ruleHolds(trigger, previous);
}

export interface WeatherContext {
  readonly forecast: WeatherForecast | null;
  readonly location: GeoPoint | null;
  readonly now: Date;
  readonly timeZone: string;
}

const MINUTE_MS = 60_000;

function isDaytime(
  condition: Extract<WeatherCondition, { type: 'daylight' }>,
  context: WeatherContext,
): boolean | null {
  if (context.location === null) {
    return null;
  }
  const today = localClock(context.now, context.timeZone);
  const sunrise = sunEventOn('sunrise', today, context.location);
  const sunset = sunEventOn('sunset', today, context.location);
  if (sunrise === null || sunset === null) {
    return null;
  }
  const at = context.now.getTime();
  return (
    at >= sunrise.getTime() + condition.sunriseOffsetMinutes * MINUTE_MS &&
    at < sunset.getTime() + condition.sunsetOffsetMinutes * MINUTE_MS
  );
}

export function weatherConditionHolds(
  condition: WeatherCondition,
  context: WeatherContext,
): boolean {
  if (condition.type !== 'daylight') {
    return ruleHolds(condition, context.forecast);
  }
  const day = isDaytime(condition, context);
  return day !== null && day === (condition.is === 'day');
}
