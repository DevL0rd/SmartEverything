import type { HealthMetric, HealthRecordType } from '@smarteverything/domain';
import { useRows } from '../../../store/selectors';
import { domainsOf, typesOfMetrics, type FitnessDomain } from '../model/domains';
import { useSightings } from './queries';

export interface HealthPresence {
  readonly types: ReadonlySet<HealthRecordType>;
  readonly domains: ReadonlySet<FitnessDomain>;
  readonly loaded: boolean;
  readonly error: Error | null;
}

export function useHealthPresence(today: string): HealthPresence {
  const live = useRows('health_daily');
  const sightings = useSightings(today);
  const metrics = new Set<HealthMetric>(live.map((row) => row.metric));
  const types = new Set<HealthRecordType>([
    ...typesOfMetrics(metrics),
    ...(sightings.data ?? []).map((sighting) => sighting.recordType),
  ]);
  return {
    types,
    domains: domainsOf(types),
    loaded: sightings.data !== undefined,
    error: sightings.error,
  };
}
