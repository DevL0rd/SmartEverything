import type { AirBand } from '../presentation/air';
import type { WeatherRow } from './forecast';

export const WEATHER_KINDS = [
  'clear',
  'partly_cloudy',
  'cloudy',
  'fog',
  'drizzle',
  'rain',
  'snow',
  'storm',
] as const;

export type WeatherKind = (typeof WEATHER_KINDS)[number];

export const WEATHER_KIND_LABELS: Readonly<Record<WeatherKind, string>> = {
  clear: 'Clear',
  partly_cloudy: 'Partly cloudy',
  cloudy: 'Cloudy',
  fog: 'Fog',
  drizzle: 'Drizzle',
  rain: 'Rain',
  snow: 'Snow',
  storm: 'Thunderstorm',
};

export const WET_KINDS: ReadonlySet<WeatherKind> = new Set(['drizzle', 'rain', 'snow', 'storm']);

interface CodeInfo {
  readonly kind: WeatherKind;
  readonly label: string;
}

const CODES: Readonly<Record<number, CodeInfo>> = {
  0: { kind: 'clear', label: 'Clear' },
  1: { kind: 'clear', label: 'Mostly clear' },
  2: { kind: 'partly_cloudy', label: 'Partly cloudy' },
  3: { kind: 'cloudy', label: 'Cloudy' },
  45: { kind: 'fog', label: 'Fog' },
  48: { kind: 'fog', label: 'Freezing fog' },
  51: { kind: 'drizzle', label: 'Light drizzle' },
  53: { kind: 'drizzle', label: 'Drizzle' },
  55: { kind: 'drizzle', label: 'Heavy drizzle' },
  56: { kind: 'drizzle', label: 'Freezing drizzle' },
  57: { kind: 'drizzle', label: 'Freezing drizzle' },
  61: { kind: 'rain', label: 'Light rain' },
  63: { kind: 'rain', label: 'Rain' },
  65: { kind: 'rain', label: 'Heavy rain' },
  66: { kind: 'rain', label: 'Freezing rain' },
  67: { kind: 'rain', label: 'Freezing rain' },
  71: { kind: 'snow', label: 'Light snow' },
  73: { kind: 'snow', label: 'Snow' },
  75: { kind: 'snow', label: 'Heavy snow' },
  77: { kind: 'snow', label: 'Snow grains' },
  80: { kind: 'rain', label: 'Light showers' },
  81: { kind: 'rain', label: 'Showers' },
  82: { kind: 'rain', label: 'Heavy showers' },
  85: { kind: 'snow', label: 'Snow showers' },
  86: { kind: 'snow', label: 'Heavy snow showers' },
  95: { kind: 'storm', label: 'Thunderstorm' },
  96: { kind: 'storm', label: 'Thunderstorm with hail' },
  99: { kind: 'storm', label: 'Thunderstorm with hail' },
};

export class UnknownWeatherCodeError extends Error {
  override readonly name = 'UnknownWeatherCodeError';

  constructor(readonly code: number) {
    super(`The weather code ${String(code)} is not a WMO weather code this app knows.`);
  }
}

export function isWeatherCode(code: number): boolean {
  return code in CODES;
}

function infoOf(code: number): CodeInfo {
  const info = CODES[code];
  if (info === undefined) {
    throw new UnknownWeatherCodeError(code);
  }
  return info;
}

export function weatherKindOf(code: number): WeatherKind {
  return infoOf(code).kind;
}

export function weatherLabelOf(code: number): string {
  return infoOf(code).label;
}

export function worseWeatherCode(left: number, right: number): number {
  const rank = (code: number): number => WEATHER_KINDS.indexOf(weatherKindOf(code)) * 100 + code;
  return rank(right) > rank(left) ? right : left;
}

const US_AQI_BANDS: readonly (readonly [number, AirBand, string])[] = [
  [50, 'good', 'Good'],
  [100, 'fair', 'Moderate'],
  [150, 'moderate', 'Unhealthy for sensitive groups'],
  [200, 'poor', 'Unhealthy'],
  [300, 'bad', 'Very unhealthy'],
];

export interface AqiVerdict {
  readonly band: AirBand;
  readonly label: string;
}

export function usAqiVerdict(aqi: number): AqiVerdict {
  const found = US_AQI_BANDS.find(([upper]) => aqi <= upper);
  return found === undefined
    ? { band: 'severe', label: 'Hazardous' }
    : { band: found[1], label: found[2] };
}

export const UV_BANDS = ['low', 'moderate', 'high', 'very_high', 'extreme'] as const;

export type UvBand = (typeof UV_BANDS)[number];

export const UV_BAND_LABELS: Readonly<Record<UvBand, string>> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  very_high: 'Very high',
  extreme: 'Extreme',
};

export function uvBandOf(index: number): UvBand {
  const rounded = Math.round(index);
  if (rounded <= 2) {
    return 'low';
  }
  if (rounded <= 5) {
    return 'moderate';
  }
  if (rounded <= 7) {
    return 'high';
  }
  return rounded <= 10 ? 'very_high' : 'extreme';
}

export const WEATHER_STALE_MS = 3 * 3_600_000;

export type WeatherStatus =
  | { readonly kind: 'no_location' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly reason: string }
  | { readonly kind: 'ready'; readonly stale: boolean; readonly problem: string | null };

export interface WeatherPlace {
  readonly latitude: number | null;
  readonly longitude: number | null;
}

export function weatherStatusOf(row: WeatherRow, place: WeatherPlace, now: Date): WeatherStatus {
  if (place.latitude === null || place.longitude === null) {
    return { kind: 'no_location' };
  }
  if (row.forecast === null || row.fetched_at === null) {
    return row.error === null ? { kind: 'loading' } : { kind: 'failed', reason: row.error };
  }
  return {
    kind: 'ready',
    stale: now.getTime() - Date.parse(row.fetched_at) > WEATHER_STALE_MS,
    problem: row.error,
  };
}
