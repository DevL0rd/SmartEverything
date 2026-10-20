import type { OutputPortDecl } from './define';
import { defineNodeKind, type NodeKind } from './define';
import { WEATHER_KINDS, WEATHER_KIND_LABELS } from '../weather/conditions';
import { WEATHER_METRICS, WEATHER_METRIC_INFO, type WeatherMetric } from '../weather/rules';

const OUTPUT_NAMES: Readonly<Record<WeatherMetric, string>> = {
  temperature: 'temperature',
  feels_like: 'feelsLike',
  humidity: 'humidity',
  wind_speed: 'windSpeed',
  precipitation: 'precipitation',
  rain_chance: 'rainChance',
  aqi: 'aqi',
  pm25: 'pm25',
  uv_index: 'uvIndex',
};

function metricOutput(metric: WeatherMetric): OutputPortDecl {
  const info = WEATHER_METRIC_INFO[metric];
  return {
    name: OUTPUT_NAMES[metric],
    type: {
      t: 'number',
      min: info.min,
      max: info.max,
      ...(info.unit === null ? {} : { unit: info.unit }),
    },
    optional: true,
    description: info.label,
  };
}

const weatherRead = defineNodeKind({
  id: 'weather.read',
  name: 'Weather now',
  category: 'cameras',
  icon: 'cloud-sun',
  class: 'read',
  description:
    'Reads the current weather at home: temperature, humidity, wind, rain, air quality, UV index and a kind.',
  inputs: [],
  outputs: [
    ...WEATHER_METRICS.map(metricOutput),
    {
      name: 'kind',
      type: {
        t: 'choice',
        options: WEATHER_KINDS.map((kind) => ({ id: kind, label: WEATHER_KIND_LABELS[kind] })),
      },
      optional: true,
      description: 'The kind of weather.',
    },
  ],
  exits: [],
  summary: 'Weather now',
  keywords: ['rain', 'raining', 'temperature', 'wind', 'uv', 'air quality', 'outside', 'weather'],
  reads: () => ['weather'],
  access: 'member',
  tier: 'v1',
});

export const WEATHER_NODE_KINDS: readonly NodeKind[] = [weatherRead];
