import { API_ENDPOINTS } from '@smarteverything/domain';
import type { Client } from './client';
import type { TestClock } from './test-clock';

export interface FakeSky {
  temperature: number;
  humidity: number;
  code: number;
}

const HOUR_SECONDS = 3600;
const DAY_SECONDS = 86_400;

function hours(count: number, value: (index: number) => number): number[] {
  return Array.from({ length: count }, (_, index) => value(index));
}

function currentBody(sky: FakeSky, seconds: number): unknown {
  return {
    time: seconds,
    temperature_2m: sky.temperature,
    apparent_temperature: sky.temperature,
    relative_humidity_2m: sky.humidity,
    dew_point_2m: 5,
    is_day: 1,
    precipitation: 0,
    weather_code: sky.code,
    cloud_cover: 20,
    pressure_msl: 1015,
    wind_speed_10m: 10,
    wind_direction_10m: 90,
    wind_gusts_10m: 20,
    uv_index: 3,
    visibility: 10_000,
  };
}

function hourlyBody(sky: FakeSky, hour: number): unknown {
  const each = (value: number): number[] => hours(6, () => value);
  return {
    time: hours(6, (index) => hour + index * HOUR_SECONDS),
    temperature_2m: each(sky.temperature),
    apparent_temperature: each(sky.temperature),
    relative_humidity_2m: each(sky.humidity),
    precipitation_probability: each(10),
    precipitation: each(0),
    weather_code: each(sky.code),
    wind_speed_10m: each(10),
    uv_index: each(3),
    is_day: each(1),
  };
}

function dailyBody(sky: FakeSky, day: number): unknown {
  return {
    time: [day],
    weather_code: [sky.code],
    temperature_2m_max: [sky.temperature + 3],
    temperature_2m_min: [sky.temperature - 3],
    sunrise: [day + 5 * HOUR_SECONDS],
    sunset: [day + 17 * HOUR_SECONDS],
    daylight_duration: [12 * HOUR_SECONDS],
    uv_index_max: [4],
    precipitation_sum: [0],
    precipitation_probability_max: [10],
    wind_speed_10m_max: [15],
    wind_gusts_10m_max: [25],
    wind_direction_10m_dominant: [90],
  };
}

function forecastBody(sky: FakeSky, now: Date): unknown {
  const seconds = Math.floor(now.getTime() / 1000);
  return {
    latitude: 52.52,
    longitude: 13.405,
    utc_offset_seconds: 0,
    current: currentBody(sky, seconds),
    hourly: hourlyBody(sky, seconds - (seconds % HOUR_SECONDS)),
    daily: dailyBody(sky, seconds - (seconds % DAY_SECONDS)),
  };
}

export function skyFetch(
  sky: FakeSky,
  clock: TestClock,
  otherwise: (input: string, init?: RequestInit) => Promise<Response>,
): typeof fetch {
  return (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith('https://api.open-meteo.com/')) {
      return Promise.resolve(Response.json(forecastBody(sky, clock.now())));
    }
    if (url.startsWith('https://air-quality-api.open-meteo.com/')) {
      return Promise.resolve(new Response('unavailable', { status: 503 }));
    }
    return otherwise(url, init);
  };
}

export interface Sky {
  readonly set: (change: Partial<FakeSky>) => Promise<void>;
}

export function skyControls(sky: FakeSky, clock: TestClock, client: Client): Sky {
  return {
    set: async (change): Promise<void> => {
      Object.assign(sky, change);
      clock.advanceTo(new Date(clock.now().getTime() + 1000).toISOString());
      await client.request(API_ENDPOINTS.refreshWeather);
    },
  };
}
