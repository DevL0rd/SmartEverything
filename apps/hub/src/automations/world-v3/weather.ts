import {
  WEATHER_METRICS,
  weatherKindOf,
  weatherMetricValue,
  type WeatherMetric,
} from '@smarteverything/domain';
import { outputsOf, type ReadHandlers, type ReadResult } from './read-port';
import type { WorldReadDeps } from './deps';

export function weatherOutputName(metric: WeatherMetric): string {
  return metric.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

export function weatherHandlers(deps: WorldReadDeps): ReadHandlers {
  return {
    'weather.read': (): ReadResult => {
      const { forecast } = deps.store.weather.read();
      if (forecast === null) return outputsOf({});
      const metrics = WEATHER_METRICS.map(
        (metric) => [weatherOutputName(metric), weatherMetricValue(forecast, metric)] as const,
      ).flatMap(([name, value]) => (value === null ? [] : [[name, value] as const]));
      return outputsOf({
        ...Object.fromEntries(metrics),
        kind: weatherKindOf(forecast.now.code),
      });
    },
  };
}
