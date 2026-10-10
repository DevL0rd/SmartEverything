import { useEffect } from 'react';
import { Logger } from '@smarteverything/logging';
import { usAqiVerdict, type WeatherForecast } from '@smarteverything/domain';
import { setWatchWeather } from '../../../modules/health-connect';
import { rawErrorText } from '../../format/errors';
import { useSettings } from '../../store/selectors';
import { useStoreSelector } from '../../store/store-context';

const log = new Logger('app.watch');

function round(value: number | null): number | null {
  return value === null ? null : Math.round(value);
}

function nowOf(forecast: WeatherForecast): Record<string, unknown> {
  const { now } = forecast;
  const aqi = round(forecast.air?.now.usAqi ?? null);
  return {
    code: now.code,
    temperatureC: Math.round(now.temperatureC),
    humidityPercent: Math.round(now.humidityPercent),
    windKmh: now.windKmh,
    windDirection: round(now.windDirection),
    uvIndex: round(now.uvIndex),
    aqi,
    aqiLabel: aqi === null ? 'Unknown' : usAqiVerdict(aqi).label,
    pressureHpa: now.pressureHpa,
  };
}

function daysOf(forecast: WeatherForecast): Record<string, unknown>[] {
  const air = new Map((forecast.air?.daily ?? []).map((day) => [day.day, round(day.usAqiMax)]));
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

function hoursOf(forecast: WeatherForecast, after: number): Record<string, unknown>[] {
  return forecast.hourly
    .filter((hour) => Date.parse(hour.at) >= after - 3_600_000)
    .map((hour) => ({
      code: hour.code,
      temperatureC: Math.round(hour.temperatureC),
      windKmh: hour.windKmh,
      windDirection: null,
    }));
}

export function useWatchWeatherPush(enabled: boolean): void {
  const row = useStoreSelector((state) => state.weather);
  const place = useSettings().home_name;
  const forecast = row?.forecast ?? null;
  const fetchedAt = row?.fetched_at ?? null;
  useEffect(() => {
    if (!enabled || forecast === null || fetchedAt === null) {
      return;
    }
    const weather = {
      place,
      timeZone: forecast.timeZone,
      publishedAt: fetchedAt,
      now: nowOf(forecast),
      days: daysOf(forecast),
      hours: hoursOf(forecast, Date.parse(fetchedAt)),
    };
    setWatchWeather(weather).then(
      (watches) => {
        log.info('watch.weather_pushed', { watches, place, fetchedAt });
      },
      (error: unknown) => {
        log.warn('watch.weather_not_pushed', { reason: rawErrorText(error) });
      },
    );
  }, [enabled, fetchedAt, place]);
}
