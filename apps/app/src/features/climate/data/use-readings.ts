import { useClimateSources } from '../model/climate-devices';
import { readingsOf, type ComfortMetric, type MetricReading } from '../model/comfort';

export function useComfortReadings(
  metrics: readonly ComfortMetric[],
  room: string | null = null,
): readonly MetricReading[] {
  return readingsOf(useClimateSources(room), metrics);
}
