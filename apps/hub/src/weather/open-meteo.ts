import type { z } from 'zod';
import { fetchJson, readAs as readProvided, type ProviderRequest } from '../outbound/provider-json';

export interface WeatherSpot {
  readonly latitude: number;
  readonly longitude: number;
  readonly timeZone: string;
}

const PROVIDER = 'Open-Meteo';

export function openMeteo<T>(
  request: ProviderRequest,
  url: string,
  schema: z.ZodType<T>,
): Promise<T> {
  return fetchJson(request, PROVIDER, url, schema);
}

export function readAs<T>(schema: z.ZodType<T>, what: string, value: unknown): T {
  return readProvided(PROVIDER, schema, what, value);
}

export function spotQuery(spot: WeatherSpot): Record<string, string> {
  return {
    latitude: String(spot.latitude),
    longitude: String(spot.longitude),
    timezone: spot.timeZone,
    timeformat: 'unixtime',
  };
}

export function instantOf(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}

export function dayOf(seconds: number, offsetSeconds: number): string {
  return new Date((seconds + offsetSeconds) * 1000).toISOString().slice(0, 10);
}
