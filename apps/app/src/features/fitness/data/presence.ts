import type { HealthMetric, HealthRecordType } from '@smarteverything/domain';
import { rowsOf, type StoreState } from '../../../store/state';
import { shallowEqual, useStoreSelector } from '../../../store/store-context';
import { domainsOf, typesOfMetrics, type FitnessDomain } from '../model/domains';
import { useSightings } from './queries';

export interface HealthPresence {
  readonly types: ReadonlySet<HealthRecordType>;
  readonly domains: ReadonlySet<FitnessDomain>;
  readonly loaded: boolean;
  readonly error: Error | null;
}

function selectLiveMetrics(state: StoreState): readonly HealthMetric[] {
  return [...new Set(rowsOf(state.tables.health_daily).map((row) => row.metric))];
}

export function useHealthPresence(today: string): HealthPresence {
  const live = useStoreSelector(selectLiveMetrics, shallowEqual);
  const sightings = useSightings(today);
  const metrics = new Set<HealthMetric>(live);
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
