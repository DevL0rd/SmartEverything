import { usAqiVerdict, uvBandOf } from './conditions';
import type { WeatherForecast } from './forecast';
import { weatherMetricValue } from './rules';

export const WEATHER_SIGNAL_METRICS = [
  'temperature',
  'feels_like',
  'humidity',
  'dew_point',
  'precipitation',
  'rain_chance',
  'cloud_cover',
  'pressure',
  'wind_speed',
  'wind_gust',
  'uv_index',
  'visibility',
  'aqi',
  'pm25',
] as const;

export type WeatherSignalMetric = (typeof WEATHER_SIGNAL_METRICS)[number];

export interface WeatherSignalMetricInfo {
  readonly label: string;
  readonly unit: string | null;
}

export const WEATHER_SIGNAL_METRIC_INFO: Readonly<
  Record<WeatherSignalMetric, WeatherSignalMetricInfo>
> = {
  temperature: { label: 'Outdoor temperature', unit: '°C' },
  feels_like: { label: 'Feels like', unit: '°C' },
  humidity: { label: 'Outdoor humidity', unit: '%' },
  dew_point: { label: 'Dew point', unit: '°C' },
  precipitation: { label: 'Rain or snow now', unit: 'mm' },
  rain_chance: { label: 'Chance of rain (next 3 h)', unit: '%' },
  cloud_cover: { label: 'Cloud cover', unit: '%' },
  pressure: { label: 'Air pressure', unit: 'hPa' },
  wind_speed: { label: 'Wind speed', unit: 'km/h' },
  wind_gust: { label: 'Wind gusts', unit: 'km/h' },
  uv_index: { label: 'UV index', unit: null },
  visibility: { label: 'Visibility', unit: 'm' },
  aqi: { label: 'Outdoor air quality (US AQI)', unit: null },
  pm25: { label: 'Outdoor PM2.5', unit: 'µg/m³' },
};

type Reader = (forecast: WeatherForecast) => number | null;

const READERS: Readonly<Record<WeatherSignalMetric, Reader>> = {
  temperature: (forecast) => weatherMetricValue(forecast, 'temperature'),
  feels_like: (forecast) => weatherMetricValue(forecast, 'feels_like'),
  humidity: (forecast) => weatherMetricValue(forecast, 'humidity'),
  dew_point: (forecast) => forecast.now.dewPointC,
  precipitation: (forecast) => weatherMetricValue(forecast, 'precipitation'),
  rain_chance: (forecast) => weatherMetricValue(forecast, 'rain_chance'),
  cloud_cover: (forecast) => forecast.now.cloudPercent,
  pressure: (forecast) => forecast.now.pressureHpa,
  wind_speed: (forecast) => weatherMetricValue(forecast, 'wind_speed'),
  wind_gust: (forecast) => forecast.now.gustKmh,
  uv_index: (forecast) => weatherMetricValue(forecast, 'uv_index'),
  visibility: (forecast) => forecast.now.visibilityM,
  aqi: (forecast) => weatherMetricValue(forecast, 'aqi'),
  pm25: (forecast) => weatherMetricValue(forecast, 'pm25'),
};

export function weatherSignalValue(
  forecast: WeatherForecast,
  metric: WeatherSignalMetric,
): number | null {
  return READERS[metric](forecast);
}

type Steps = readonly (readonly [number, string])[];

function stepped(steps: Steps, top: string): (value: number) => string {
  return (value) => steps.find(([below]) => value < below)?.[1] ?? top;
}

const TEMPERATURE_BANDS: Steps = [
  [0, 'freezing'],
  [10, 'cold'],
  [18, 'cool'],
  [24, 'mild'],
  [30, 'warm'],
];

export const WEATHER_BANDS = {
  temperature: {
    bands: ['freezing', 'cold', 'cool', 'mild', 'warm', 'hot'],
    of: stepped(TEMPERATURE_BANDS, 'hot'),
  },
  feels_like: {
    bands: ['freezing', 'cold', 'cool', 'mild', 'warm', 'hot'],
    of: stepped(TEMPERATURE_BANDS, 'hot'),
  },
  humidity: {
    bands: ['dry', 'comfortable', 'humid'],
    of: stepped(
      [
        [30, 'dry'],
        [60, 'comfortable'],
      ],
      'humid',
    ),
  },
  precipitation: {
    bands: ['none', 'light', 'moderate', 'heavy'],
    of: (value: number): string =>
      value <= 0
        ? 'none'
        : stepped(
            [
              [2.5, 'light'],
              [7.6, 'moderate'],
            ],
            'heavy',
          )(value),
  },
  cloud_cover: {
    bands: ['clear', 'partly_cloudy', 'overcast'],
    of: stepped(
      [
        [20, 'clear'],
        [70, 'partly_cloudy'],
      ],
      'overcast',
    ),
  },
  wind_speed: {
    bands: ['calm', 'breezy', 'windy', 'gale', 'storm'],
    of: stepped(
      [
        [6, 'calm'],
        [29, 'breezy'],
        [50, 'windy'],
        [89, 'gale'],
      ],
      'storm',
    ),
  },
  uv_index: { bands: ['low', 'moderate', 'high', 'very_high', 'extreme'], of: uvBandOf },
  aqi: {
    bands: ['good', 'fair', 'moderate', 'poor', 'bad', 'severe'],
    of: (value: number): string => usAqiVerdict(value).band,
  },
} as const satisfies Partial<
  Record<
    WeatherSignalMetric,
    { readonly bands: readonly string[]; readonly of: (value: number) => string }
  >
>;

export type WeatherBandMetric = keyof typeof WEATHER_BANDS;

export const WEATHER_BAND_METRICS = Object.keys(WEATHER_BANDS).filter(
  (metric): metric is WeatherBandMetric => Object.hasOwn(WEATHER_BANDS, metric),
);

export function weatherBandOf(forecast: WeatherForecast, metric: WeatherBandMetric): string | null {
  const value = weatherSignalValue(forecast, metric);
  return value === null ? null : WEATHER_BANDS[metric].of(value);
}

export const RAIN_HORIZONS = ['15m', '30m', '1h', '2h', '3h', '6h'] as const;

export type RainHorizon = (typeof RAIN_HORIZONS)[number];

export const RAIN_HORIZON_MINUTES: Readonly<Record<RainHorizon, number>> = {
  '15m': 15,
  '30m': 30,
  '1h': 60,
  '2h': 120,
  '3h': 180,
  '6h': 360,
};
