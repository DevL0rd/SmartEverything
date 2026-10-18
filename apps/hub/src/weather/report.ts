import {
  ApiError,
  WEATHER_ATTRIBUTION,
  WEATHER_REPORT,
  weatherStatusOf,
  type SettingsRow,
  type WeatherReport,
  type WeatherRow,
} from '@smarteverything/domain';

const NO_LOCATION_MESSAGE =
  'Set the home’s location in Settings › Home › Location to get the weather.';

export function reportOf(row: WeatherRow, settings: SettingsRow, now: Date): WeatherReport {
  const status = weatherStatusOf(row, settings, now);
  if (status.kind === 'no_location') {
    throw new ApiError('conflict', NO_LOCATION_MESSAGE);
  }
  if (status.kind === 'failed') {
    throw new ApiError('upstream_failed', `The weather isn’t available: ${status.reason}`);
  }
  if (row.forecast === null || row.fetched_at === null) {
    throw new ApiError('upstream_failed', 'The weather is still being fetched; try again shortly.');
  }
  return WEATHER_REPORT.parse({
    place: settings.home_name,
    timeZone: settings.time_zone,
    fetchedAt: row.fetched_at,
    stale: status.kind === 'ready' && status.stale,
    airError: row.air_error,
    forecast: row.forecast,
    attribution: WEATHER_ATTRIBUTION,
  });
}
