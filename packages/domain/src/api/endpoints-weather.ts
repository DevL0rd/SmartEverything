import { WEATHER_REPORT } from '../weather/forecast';
import { NO_BODY, endpoint } from './endpoint';
import { NOTHING } from './primitives';

export const WEATHER_AREA_ENDPOINTS = {
  readWeather: endpoint({
    method: 'GET',
    path: '/api/weather',
    access: 'member',
    summary:
      'Weather at the home’s location: now, 48 hours, 10 days, air quality, sunrise and sunset',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: WEATHER_REPORT,
  }),
  refreshWeather: endpoint({
    method: 'POST',
    path: '/api/weather/refresh',
    access: 'member',
    summary: 'Fetch the weather now instead of waiting for the next hourly update',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: WEATHER_REPORT,
  }),
} as const;
