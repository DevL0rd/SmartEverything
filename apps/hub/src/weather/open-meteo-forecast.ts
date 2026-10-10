import {
  WEATHER_DAY,
  WEATHER_DAYS,
  WEATHER_HOUR,
  WEATHER_HOURS,
  WEATHER_NOW,
  worseWeatherCode,
  type WeatherDay,
  type WeatherHour,
  type WeatherNow,
} from '@smarteverything/domain';
import { z } from 'zod';
import { dayOf, instantOf, openMeteo, readAs, spotQuery, type WeatherSpot } from './open-meteo';
import type { ProviderRequest } from '../outbound/provider-json';

const BASE = 'https://api.open-meteo.com/v1/forecast';

const VALUE = z.number().nullable();

const RAW_NOW = z.object({
  time: z.int(),
  temperature_2m: VALUE,
  apparent_temperature: VALUE,
  relative_humidity_2m: VALUE,
  dew_point_2m: VALUE,
  is_day: VALUE,
  precipitation: VALUE,
  weather_code: VALUE,
  cloud_cover: VALUE,
  pressure_msl: VALUE,
  wind_speed_10m: VALUE,
  wind_direction_10m: VALUE,
  wind_gusts_10m: VALUE,
  uv_index: VALUE,
  visibility: VALUE,
});

const CURRENT = Object.keys(RAW_NOW.shape)
  .filter((key) => key !== 'time')
  .join(',');

const HOURLY =
  'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,uv_index,is_day';

const DAILY =
  'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,daylight_duration,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant';

const SERIES = z.object({ time: z.array(z.int()) }).catchall(z.array(VALUE));

type Series = z.infer<typeof SERIES>;

const RAW_FORECAST = z.object({
  latitude: z.number(),
  longitude: z.number(),
  utc_offset_seconds: z.int(),
  current: RAW_NOW,
  hourly: SERIES,
  daily: SERIES,
});

type RawForecast = z.infer<typeof RAW_FORECAST>;

export interface ForecastParts {
  readonly latitude: number;
  readonly longitude: number;
  readonly now: WeatherNow;
  readonly hourly: WeatherHour[];
  readonly daily: WeatherDay[];
}

function cell(series: Series, key: string, index: number): number | null | undefined {
  return series[key]?.[index];
}

function flag(value: number | null | undefined): unknown {
  return value === 1 ? true : value === 0 ? false : value;
}

function moment(value: number | null | undefined): string | null | undefined {
  return typeof value === 'number' ? instantOf(value) : value;
}

function nowOf(raw: RawForecast): WeatherNow {
  const c = raw.current;
  return readAs(WEATHER_NOW, 'current weather', {
    at: instantOf(c.time),
    temperatureC: c.temperature_2m,
    feelsLikeC: c.apparent_temperature,
    humidityPercent: c.relative_humidity_2m,
    dewPointC: c.dew_point_2m,
    precipitationMm: c.precipitation,
    code: c.weather_code,
    isDay: flag(c.is_day),
    cloudPercent: c.cloud_cover,
    pressureHpa: c.pressure_msl,
    windKmh: c.wind_speed_10m,
    windDirection: c.wind_direction_10m,
    gustKmh: c.wind_gusts_10m,
    uvIndex: c.uv_index,
    visibilityM: c.visibility,
  });
}

function hourAt(series: Series, index: number): WeatherHour {
  const value = (key: string): number | null | undefined => cell(series, key, index);
  return readAs(WEATHER_HOUR, 'hourly forecast', {
    at: moment(series.time[index]),
    temperatureC: value('temperature_2m'),
    feelsLikeC: value('apparent_temperature'),
    humidityPercent: value('relative_humidity_2m'),
    precipitationChance: value('precipitation_probability'),
    precipitationMm: value('precipitation'),
    code: value('weather_code'),
    windKmh: value('wind_speed_10m'),
    uvIndex: value('uv_index'),
    isDay: flag(value('is_day')),
  });
}

const NIGHT_FALLBACK_MS = 12 * 3_600_000;

function nightCodeOf(
  hours: readonly WeatherHour[],
  sunset: string | null,
  nextSunrise: string | null,
  dayCode: number,
): number {
  if (sunset === null) {
    return dayCode;
  }
  const start = Date.parse(sunset);
  const end = nextSunrise === null ? start + NIGHT_FALLBACK_MS : Date.parse(nextSunrise);
  const codes = hours
    .filter((hour) => !hour.isDay && Date.parse(hour.at) >= start && Date.parse(hour.at) < end)
    .map((hour) => hour.code);
  return codes.length === 0 ? dayCode : codes.reduce(worseWeatherCode);
}

function dayAt(raw: RawForecast, index: number, hours: readonly WeatherHour[]): WeatherDay {
  const series = raw.daily;
  const value = (key: string): number | null | undefined => cell(series, key, index);
  const sunset = moment(value('sunset'));
  const nextSunrise = moment(cell(series, 'sunrise', index + 1));
  const code = value('weather_code');
  const time = series.time[index];
  return readAs(WEATHER_DAY, 'daily forecast', {
    day: time === undefined ? undefined : dayOf(time, raw.utc_offset_seconds),
    code,
    nightCode:
      typeof code === 'number' && sunset !== undefined
        ? nightCodeOf(hours, sunset, nextSunrise ?? null, code)
        : code,
    minC: value('temperature_2m_min'),
    maxC: value('temperature_2m_max'),
    sunrise: moment(value('sunrise')),
    sunset,
    daylightSeconds: value('daylight_duration'),
    uvMax: value('uv_index_max'),
    precipitationMm: value('precipitation_sum'),
    precipitationChance: value('precipitation_probability_max'),
    windMaxKmh: value('wind_speed_10m_max'),
    gustMaxKmh: value('wind_gusts_10m_max'),
    windDirection: value('wind_direction_10m_dominant'),
  });
}

function upcoming(hours: readonly WeatherHour[], now: WeatherNow): WeatherHour[] {
  const hourStart = Date.parse(now.at) - (Date.parse(now.at) % 3_600_000);
  return hours.filter((hour) => Date.parse(hour.at) >= hourStart).slice(0, WEATHER_HOURS);
}

export async function fetchForecast(
  request: ProviderRequest,
  spot: WeatherSpot,
): Promise<ForecastParts> {
  const query = new URLSearchParams({
    ...spotQuery(spot),
    current: CURRENT,
    hourly: HOURLY,
    daily: DAILY,
    forecast_days: String(WEATHER_DAYS),
  });
  const raw = await openMeteo(request, `${BASE}?${query.toString()}`, RAW_FORECAST);
  const hours = raw.hourly.time.map((_, index) => hourAt(raw.hourly, index));
  const now = nowOf(raw);
  return {
    latitude: raw.latitude,
    longitude: raw.longitude,
    now,
    hourly: upcoming(hours, now),
    daily: raw.daily.time.map((_, index) => dayAt(raw, index, hours)),
  };
}
