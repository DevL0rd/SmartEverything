import { WEATHER_FORECAST, type WeatherForecast } from '@smarteverything/domain';
import { NOW } from './support';

const HOUR_MS = 3_600_000;

const CURRENT = {
  at: NOW,
  temperatureC: 21.5,
  feelsLikeC: 20,
  humidityPercent: 55,
  dewPointC: null,
  precipitationMm: 0.4,
  code: 61,
  isDay: true,
  cloudPercent: null,
  pressureHpa: null,
  windKmh: 12,
  windDirection: null,
  gustKmh: null,
  uvIndex: 3,
  visibilityM: null,
};

const DAY = {
  day: '2026-10-18',
  code: 3,
  nightCode: 3,
  minC: 8,
  maxC: 16,
  sunrise: null,
  sunset: null,
  daylightSeconds: null,
  uvMax: null,
  precipitationMm: 0,
  precipitationChance: null,
  windMaxKmh: 10,
  gustMaxKmh: null,
  windDirection: null,
};

const AIR = {
  now: {
    at: NOW,
    usAqi: 42,
    europeanAqi: null,
    pm25: 8.5,
    pm10: null,
    ozone: null,
    nitrogenDioxide: null,
    uvIndex: null,
    pollen: { alder: null, birch: null, grass: null, mugwort: null, olive: null, ragweed: null },
  },
  hourly: [],
  daily: [],
};

function hourAhead(offset: number, chance: number): unknown {
  return {
    at: new Date(Date.parse(NOW) + offset * HOUR_MS).toISOString(),
    temperatureC: 20,
    feelsLikeC: 20,
    humidityPercent: 50,
    precipitationChance: chance,
    precipitationMm: 0,
    code: 3,
    windKmh: 5,
    uvIndex: null,
    isDay: true,
  };
}

export function forecastOf(): WeatherForecast {
  return WEATHER_FORECAST.parse({
    latitude: 52.5,
    longitude: 13.4,
    timeZone: 'UTC',
    now: CURRENT,
    hourly: [hourAhead(1, 30), hourAhead(2, 70), hourAhead(3, 20)],
    daily: [DAY],
    air: AIR,
  });
}
