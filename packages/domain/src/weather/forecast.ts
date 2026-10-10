import { z } from 'zod';
import { DAY, MOMENT } from '../api/primitives';
import { isWeatherCode } from './conditions';

export const WEATHER_HOURS = 48;

export const WEATHER_DAYS = 10;

export const AIR_DAYS = 5;

export const WEATHER_CODE = z.int().refine(isWeatherCode, { message: 'a WMO weather code' });

const CELSIUS = z.number().min(-100).max(70);
const PERCENT = z.number().min(0).max(100);
const AMOUNT = z.number().min(0);
const BEARING = z.number().min(0).max(360);

export const WEATHER_NOW = z.strictObject({
  at: MOMENT,
  temperatureC: CELSIUS,
  feelsLikeC: CELSIUS,
  humidityPercent: PERCENT,
  dewPointC: CELSIUS.nullable(),
  precipitationMm: AMOUNT,
  code: WEATHER_CODE,
  isDay: z.boolean(),
  cloudPercent: PERCENT.nullable(),
  pressureHpa: AMOUNT.nullable(),
  windKmh: AMOUNT,
  windDirection: BEARING.nullable(),
  gustKmh: AMOUNT.nullable(),
  uvIndex: AMOUNT.nullable(),
  visibilityM: AMOUNT.nullable(),
});

export type WeatherNow = z.infer<typeof WEATHER_NOW>;

export const WEATHER_HOUR = z.strictObject({
  at: MOMENT,
  temperatureC: CELSIUS,
  feelsLikeC: CELSIUS,
  humidityPercent: PERCENT,
  precipitationChance: PERCENT.nullable(),
  precipitationMm: AMOUNT,
  code: WEATHER_CODE,
  windKmh: AMOUNT,
  uvIndex: AMOUNT.nullable(),
  isDay: z.boolean(),
});

export type WeatherHour = z.infer<typeof WEATHER_HOUR>;

export const WEATHER_DAY = z.strictObject({
  day: DAY,
  code: WEATHER_CODE,
  nightCode: WEATHER_CODE,
  minC: CELSIUS,
  maxC: CELSIUS,
  sunrise: MOMENT.nullable(),
  sunset: MOMENT.nullable(),
  daylightSeconds: AMOUNT.nullable(),
  uvMax: AMOUNT.nullable(),
  precipitationMm: AMOUNT,
  precipitationChance: PERCENT.nullable(),
  windMaxKmh: AMOUNT,
  gustMaxKmh: AMOUNT.nullable(),
  windDirection: BEARING.nullable(),
});

export type WeatherDay = z.infer<typeof WEATHER_DAY>;

export const POLLEN_KINDS = ['alder', 'birch', 'grass', 'mugwort', 'olive', 'ragweed'] as const;

export type PollenKind = (typeof POLLEN_KINDS)[number];

export const POLLEN = z.strictObject({
  alder: AMOUNT.nullable(),
  birch: AMOUNT.nullable(),
  grass: AMOUNT.nullable(),
  mugwort: AMOUNT.nullable(),
  olive: AMOUNT.nullable(),
  ragweed: AMOUNT.nullable(),
});

export type Pollen = z.infer<typeof POLLEN>;

export const AIR_NOW = z.strictObject({
  at: MOMENT,
  usAqi: AMOUNT.nullable(),
  europeanAqi: AMOUNT.nullable(),
  pm25: AMOUNT.nullable(),
  pm10: AMOUNT.nullable(),
  ozone: AMOUNT.nullable(),
  nitrogenDioxide: AMOUNT.nullable(),
  uvIndex: AMOUNT.nullable(),
  pollen: POLLEN,
});

export type AirNow = z.infer<typeof AIR_NOW>;

export const AIR_HOUR = z.strictObject({
  at: MOMENT,
  usAqi: AMOUNT.nullable(),
  pm25: AMOUNT.nullable(),
});

export type AirHour = z.infer<typeof AIR_HOUR>;

export const AIR_DAY = z.strictObject({
  day: DAY,
  usAqiMax: AMOUNT.nullable(),
  pm25Max: AMOUNT.nullable(),
});

export type AirDay = z.infer<typeof AIR_DAY>;

export const WEATHER_AIR = z.strictObject({
  now: AIR_NOW,
  hourly: z.array(AIR_HOUR).max(WEATHER_HOURS),
  daily: z.array(AIR_DAY).max(AIR_DAYS + 1),
});

export type WeatherAir = z.infer<typeof WEATHER_AIR>;

export const WEATHER_FORECAST = z.strictObject({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  timeZone: z.string().min(1),
  now: WEATHER_NOW,
  hourly: z.array(WEATHER_HOUR).max(WEATHER_HOURS),
  daily: z.array(WEATHER_DAY).min(1).max(WEATHER_DAYS),
  air: WEATHER_AIR.nullable(),
});

export type WeatherForecast = z.infer<typeof WEATHER_FORECAST>;

export const WEATHER_ROW = z.strictObject({
  id: z.literal('home'),
  forecast: WEATHER_FORECAST.nullable(),
  fetched_at: MOMENT.nullable(),
  next_fetch_at: MOMENT.nullable(),
  error: z.string().nullable(),
  air_error: z.string().nullable(),
  failed_at: MOMENT.nullable(),
  updated_at: MOMENT,
});

export type WeatherRow = z.infer<typeof WEATHER_ROW>;

export const WEATHER_REPORT = z.strictObject({
  place: z.string().min(1).max(120),
  timeZone: z.string().min(1),
  fetchedAt: MOMENT,
  stale: z.boolean(),
  airError: z.string().nullable(),
  forecast: WEATHER_FORECAST,
  attribution: z.string().min(1),
});

export type WeatherReport = z.infer<typeof WEATHER_REPORT>;

export const WEATHER_ATTRIBUTION =
  'Weather data by Open-Meteo.com (CC BY 4.0). Air quality from Copernicus Atmosphere Monitoring Service.';
