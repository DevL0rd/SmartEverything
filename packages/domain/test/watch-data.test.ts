import { describe, expect, it } from 'vitest';
import { FITNESS_GOAL_LIMITS } from '../src/fitness-settings';
import { WATCH_USER, WATCH_WEATHER, watchUserOf, watchWeatherOf } from '../src/watch-data';
import { WEATHER_FORECAST } from '../src/weather/forecast';

const NO_GOALS = {
  steps: null,
  move_kcal: null,
  active_minutes: null,
  sleep_minutes: null,
  hydration_ml: null,
};

function forecastWith(air: unknown): ReturnType<typeof WEATHER_FORECAST.parse> {
  const hour = (at: string, temperatureC: number): unknown => ({
    at,
    temperatureC,
    feelsLikeC: temperatureC,
    humidityPercent: 50,
    precipitationChance: null,
    precipitationMm: 0,
    code: 3,
    windKmh: 12.5,
    uvIndex: null,
    isDay: true,
  });
  return WEATHER_FORECAST.parse({
    latitude: 52.5,
    longitude: 13.4,
    timeZone: 'Europe/Berlin',
    now: {
      at: '2026-10-08T12:00:00.000Z',
      temperatureC: 10.6,
      feelsLikeC: 9,
      humidityPercent: 49.5,
      dewPointC: null,
      precipitationMm: 0,
      code: 3,
      isDay: true,
      cloudPercent: null,
      pressureHpa: 1012.4,
      windKmh: 7.5,
      windDirection: 200.4,
      gustKmh: null,
      uvIndex: 2.6,
      visibilityM: null,
    },
    hourly: [
      hour('2026-10-08T09:00:00.000Z', 8),
      hour('2026-10-08T11:00:00.000Z', 9.5),
      hour('2026-10-08T13:00:00.000Z', 11.4),
    ],
    daily: [
      {
        day: '2026-10-08',
        code: 61,
        nightCode: 3,
        minC: 3.5,
        maxC: 12.4,
        sunrise: '2026-10-08T05:00:00.000Z',
        sunset: null,
        daylightSeconds: null,
        uvMax: null,
        precipitationMm: 0,
        precipitationChance: null,
        windMaxKmh: 8,
        gustMaxKmh: null,
        windDirection: null,
      },
      {
        day: '2026-10-09',
        code: 3,
        nightCode: 3,
        minC: 2,
        maxC: 9,
        sunrise: null,
        sunset: null,
        daylightSeconds: null,
        uvMax: null,
        precipitationMm: 0,
        precipitationChance: null,
        windMaxKmh: 8,
        gustMaxKmh: null,
        windDirection: null,
      },
    ],
    air,
  });
}

const AIR = {
  now: {
    at: '2026-10-08T12:00:00.000Z',
    usAqi: 72.4,
    europeanAqi: null,
    pm25: null,
    pm10: null,
    ozone: null,
    nitrogenDioxide: null,
    uvIndex: null,
    pollen: { alder: null, birch: null, grass: null, mugwort: null, olive: null, ragweed: null },
  },
  hourly: [],
  daily: [{ day: '2026-10-08', usAqiMax: 88.6, pm25Max: null }],
};

describe('watchWeatherOf', () => {
  it('rounds readings, labels the air and keeps the hours from one hour before the fetch', () => {
    const watch = watchWeatherOf(forecastWith(AIR), 'Berlin', '2026-10-08T12:00:00.000Z');
    expect(WATCH_WEATHER.parse(watch)).toStrictEqual(watch);
    expect(watch.now).toStrictEqual({
      code: 3,
      temperatureC: 11,
      humidityPercent: 50,
      windKmh: 7.5,
      windDirection: 200,
      uvIndex: 3,
      aqi: 72,
      aqiLabel: 'Moderate',
      pressureHpa: 1012.4,
    });
    expect(watch.hours.map((hour) => hour.temperatureC)).toStrictEqual([10, 11]);
    expect(watch.hours.map((hour) => hour.windDirection)).toStrictEqual([null, null]);
    expect(watch.place).toBe('Berlin');
    expect(watch.timeZone).toBe('Europe/Berlin');
    expect(watch.publishedAt).toBe('2026-10-08T12:00:00.000Z');
  });

  it('matches daily air to its day and leaves the other days without a value', () => {
    const watch = watchWeatherOf(forecastWith(AIR), 'Berlin', '2026-10-08T12:00:00.000Z');
    expect(watch.days.map((day) => day.aqi)).toStrictEqual([89, null]);
    expect(watch.days[0]).toMatchObject({ minC: 4, maxC: 12, nightCode: 3, sunset: null });
  });

  it('reports unknown air when the forecast has none', () => {
    const watch = watchWeatherOf(forecastWith(null), 'Berlin', '2026-10-08T12:00:00.000Z');
    expect(watch.now.aqi).toBeNull();
    expect(watch.now.aqiLabel).toBe('Unknown');
    expect(watch.days.every((day) => day.aqi === null)).toBe(true);
  });

  it('keeps an unmeasured wind direction and uv index as null', () => {
    const base = forecastWith(null);
    const watch = watchWeatherOf(
      { ...base, now: { ...base.now, windDirection: null, uvIndex: null } },
      'Berlin',
      '2026-10-08T12:00:00.000Z',
    );
    expect(watch.now.windDirection).toBeNull();
    expect(watch.now.uvIndex).toBeNull();
  });
});

describe('watchUserOf', () => {
  const ON = new Date('2026-10-08T12:00:00.000Z');
  const PROFILE = {
    sex: 'female',
    birth_date: '1996-10-08',
    height_cm: 170,
    max_heart_rate: null,
    fitness_goals: { ...NO_GOALS, steps: 12_000 },
  } as const;

  it('needs body facts, a weight and a birth date', () => {
    expect(watchUserOf({ ...PROFILE, height_cm: null }, 60, ON)).toBeNull();
    expect(watchUserOf(PROFILE, null, ON)).toBeNull();
  });

  it('estimates the heart rate ceiling by age and uses goals with their standards', () => {
    const user = watchUserOf(PROFILE, 61.5, ON);
    expect(user).toStrictEqual({
      heightCm: 170,
      weightKg: 61.5,
      birthDate: '1996-10-08',
      female: true,
      maxHeartRate: 190,
      stepGoal: 12_000,
      calorieGoal: FITNESS_GOAL_LIMITS.move_kcal.standard,
      activeMinutes: FITNESS_GOAL_LIMITS.active_minutes.standard,
    });
    expect(WATCH_USER.safeParse(user).success).toBe(true);
  });

  it('uses the lower slope estimate past forty and the stored maximum when set', () => {
    const older = watchUserOf({ ...PROFILE, sex: 'male', birth_date: '1966-10-08' }, 80, ON);
    expect(older).toMatchObject({ female: false, maxHeartRate: 165 });
    const stored = watchUserOf({ ...PROFILE, max_heart_rate: 185 }, 61.5, ON);
    expect(stored?.maxHeartRate).toBe(185);
  });
});
