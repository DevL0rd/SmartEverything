import {
  UV_BAND_LABELS,
  WEATHER_DAYS,
  WEATHER_HOURS,
  usAqiVerdict,
  uvBandOf,
  weatherLabelOf,
  type WeatherReport,
} from '@smarteverything/domain';
import { z } from 'zod';
import { reportOf } from '../../../weather/report';
import { READS, defineTool, type Tool, type ToolContext } from './registry';

function reportIn(context: ToolContext): WeatherReport {
  const { store, clock } = context;
  return reportOf(store.weather.read(), store.settings.read(), clock.now());
}

function source(report: WeatherReport): Record<string, unknown> {
  return {
    place: report.place,
    time_zone: report.timeZone,
    fetched_at: report.fetchedAt,
    stale: report.stale,
    attribution: report.attribution,
  };
}

function airNow(report: WeatherReport): Record<string, unknown> | string {
  const air = report.forecast.air;
  if (air === null) {
    return report.airError ?? 'Air quality is not available for this place.';
  }
  const aqi = air.now.usAqi;
  return { ...air.now, us_aqi_verdict: aqi === null ? null : usAqiVerdict(aqi).label };
}

export const WEATHER_TOOLS: readonly Tool[] = [
  defineTool({
    name: 'weather_read',
    input: z.strictObject({}),
    annotations: READS,
    run: (context) => {
      const report = reportIn(context);
      const { now, daily } = report.forecast;
      return {
        structured: {
          ...source(report),
          now: {
            ...now,
            condition: weatherLabelOf(now.code),
            uv: now.uvIndex === null ? null : UV_BAND_LABELS[uvBandOf(now.uvIndex)],
          },
          today: daily[0] ?? null,
          air: airNow(report),
        },
      };
    },
  }),
  defineTool({
    name: 'get_forecast',
    input: z.strictObject({
      hours: z.int().min(0).max(WEATHER_HOURS).default(24).describe('Hours ahead to include'),
      days: z
        .int()
        .min(0)
        .max(WEATHER_DAYS)
        .default(7)
        .describe('Days ahead to include, today first'),
    }),
    annotations: READS,
    run: (context, input) => {
      const report = reportIn(context);
      const { hourly, daily, air } = report.forecast;
      return {
        structured: {
          ...source(report),
          hourly: hourly
            .slice(0, input.hours)
            .map((hour) => ({ ...hour, condition: weatherLabelOf(hour.code) })),
          daily: daily.slice(0, input.days).map((day) => ({
            ...day,
            condition: weatherLabelOf(day.code),
            night_condition: weatherLabelOf(day.nightCode),
          })),
          air_hourly: air === null ? [] : air.hourly.slice(0, input.hours),
          air_daily: air === null ? [] : air.daily.slice(0, input.days),
        },
      };
    },
  }),
];
