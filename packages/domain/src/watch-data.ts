import { z } from 'zod';
import { bodyFactsOf, type ProfileRow } from './profiles';
import { effectiveFitnessGoals } from './fitness-settings';
import { usAqiVerdict } from './weather/conditions';
import type { WeatherForecast } from './weather/forecast';

const WATCH_WEATHER_NOW = z.strictObject({
  code: z.int(),
  temperatureC: z.int(),
  humidityPercent: z.int(),
  windKmh: z.number(),
  windDirection: z.int().nullable(),
  uvIndex: z.int().nullable(),
  aqi: z.int().nullable(),
  aqiLabel: z.string(),
  pressureHpa: z.number().nullable(),
});

const WATCH_WEATHER_DAY = z.strictObject({
  code: z.int(),
  nightCode: z.int(),
  minC: z.int(),
  maxC: z.int(),
  aqi: z.int().nullable(),
  sunrise: z.string().nullable(),
  sunset: z.string().nullable(),
});

const WATCH_WEATHER_HOUR = z.strictObject({
  code: z.int(),
  temperatureC: z.int(),
  windKmh: z.number(),
  windDirection: z.null(),
});

export const WATCH_WEATHER = z.strictObject({
  place: z.string(),
  timeZone: z.string(),
  publishedAt: z.string(),
  now: WATCH_WEATHER_NOW,
  days: z.array(WATCH_WEATHER_DAY),
  hours: z.array(WATCH_WEATHER_HOUR),
});

export type WatchWeather = z.infer<typeof WATCH_WEATHER>;

export const WATCH_USER = z.strictObject({
  heightCm: z.int(),
  weightKg: z.number(),
  birthDate: z.string(),
  female: z.boolean(),
  maxHeartRate: z.int(),
  stepGoal: z.int(),
  calorieGoal: z.int(),
  activeMinutes: z.int(),
});

export type WatchUser = z.infer<typeof WATCH_USER>;

export const WATCH_DATA = z.strictObject({
  weather: WATCH_WEATHER.nullable(),
  user: WATCH_USER.nullable(),
});

export type WatchData = z.infer<typeof WATCH_DATA>;

const HOUR_MS = 3_600_000;

function rounded(value: number | null): number | null {
  return value === null ? null : Math.round(value);
}

function nowOf(forecast: WeatherForecast): WatchWeather['now'] {
  const { now } = forecast;
  const aqi = rounded(forecast.air?.now.usAqi ?? null);
  return {
    code: now.code,
    temperatureC: Math.round(now.temperatureC),
    humidityPercent: Math.round(now.humidityPercent),
    windKmh: now.windKmh,
    windDirection: rounded(now.windDirection),
    uvIndex: rounded(now.uvIndex),
    aqi,
    aqiLabel: aqi === null ? 'Unknown' : usAqiVerdict(aqi).label,
    pressureHpa: now.pressureHpa,
  };
}

function daysOf(forecast: WeatherForecast): WatchWeather['days'] {
  const air = new Map((forecast.air?.daily ?? []).map((day) => [day.day, rounded(day.usAqiMax)]));
  return forecast.daily.map((day) => ({
    code: day.code,
    nightCode: day.nightCode,
    minC: Math.round(day.minC),
    maxC: Math.round(day.maxC),
    aqi: air.get(day.day) ?? null,
    sunrise: day.sunrise,
    sunset: day.sunset,
  }));
}

function hoursOf(forecast: WeatherForecast, after: number): WatchWeather['hours'] {
  return forecast.hourly
    .filter((hour) => Date.parse(hour.at) >= after - HOUR_MS)
    .map((hour) => ({
      code: hour.code,
      temperatureC: Math.round(hour.temperatureC),
      windKmh: hour.windKmh,
      windDirection: null,
    }));
}

export function watchWeatherOf(
  forecast: WeatherForecast,
  place: string,
  fetchedAt: string,
): WatchWeather {
  return {
    place,
    timeZone: forecast.timeZone,
    publishedAt: fetchedAt,
    now: nowOf(forecast),
    days: daysOf(forecast),
    hours: hoursOf(forecast, Date.parse(fetchedAt)),
  };
}

function maxHeartRateOf(profile: Pick<ProfileRow, 'max_heart_rate'>, age: number): number {
  if (profile.max_heart_rate !== null) {
    return profile.max_heart_rate;
  }
  return Math.round(age <= 40 ? 220 - age : 207 - 0.7 * age);
}

export function watchUserOf(
  profile: Pick<
    ProfileRow,
    'sex' | 'birth_date' | 'height_cm' | 'max_heart_rate' | 'fitness_goals'
  >,
  weightKg: number | null,
  on: Date,
): WatchUser | null {
  const facts = bodyFactsOf(profile, on);
  if (facts === null || weightKg === null || profile.birth_date === null) {
    return null;
  }
  const goals = effectiveFitnessGoals(profile.fitness_goals);
  return {
    heightCm: facts.heightCm,
    weightKg,
    birthDate: profile.birth_date,
    female: facts.sex === 'female',
    maxHeartRate: maxHeartRateOf(profile, facts.age),
    stepGoal: goals.steps,
    calorieGoal: goals.move_kcal,
    activeMinutes: goals.active_minutes,
  };
}
