import type { HealthMetric, HealthRecordType } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import { SERIES } from './catalogue';
import type { SeriesGroup } from './series-spec';

export const FITNESS_DOMAINS = [
  'activity',
  'nutrition',
  'heart',
  'sleep',
  'body',
  'workouts',
  'vitals',
] as const;

export type FitnessDomain = (typeof FITNESS_DOMAINS)[number];

export interface DomainInfo {
  readonly domain: FitnessDomain;
  readonly title: string;
  readonly icon: IconName;
  readonly series: readonly string[];
}

export const DOMAIN_INFO: Readonly<Record<FitnessDomain, DomainInfo>> = {
  activity: {
    domain: 'activity',
    title: 'Activity',
    icon: 'footprints',
    series: ['steps', 'active_energy', 'exercise', 'distance', 'floors', 'total_energy'],
  },
  heart: {
    domain: 'heart',
    title: 'Heart',
    icon: 'heartPulse',
    series: ['heart_rate', 'resting_heart_rate', 'heart_rate_variability'],
  },
  sleep: { domain: 'sleep', title: 'Sleep', icon: 'moon', series: ['sleep'] },
  body: {
    domain: 'body',
    title: 'Body',
    icon: 'scale',
    series: [
      'weight',
      'body_fat',
      'lean_body_mass',
      'body_water_mass',
      'bone_mass',
      'basal_metabolic_rate',
    ],
  },
  workouts: { domain: 'workouts', title: 'Workouts', icon: 'dumbbell', series: ['exercise'] },
  vitals: {
    domain: 'vitals',
    title: 'Vitals',
    icon: 'breath',
    series: [
      'oxygen_saturation',
      'respiratory_rate',
      'vo2_max',
      'blood_pressure',
      'blood_glucose',
      'body_temperature',
      'skin_temperature',
    ],
  },
  nutrition: {
    domain: 'nutrition',
    title: 'Nutrition',
    icon: 'salad',
    series: ['nutrition', 'hydration'],
  },
};

const GROUP_DOMAIN: Readonly<Partial<Record<SeriesGroup, FitnessDomain>>> = {
  activity: 'activity',
  heart: 'heart',
  sleep: 'sleep',
  body: 'body',
  vitals: 'vitals',
  nutrition: 'nutrition',
};

export function typesOfMetrics(metrics: Iterable<HealthMetric>): ReadonlySet<HealthRecordType> {
  const wanted = new Set(metrics);
  return new Set(
    SERIES.filter(
      (spec) =>
        (spec.daily !== null && wanted.has(spec.daily)) ||
        (spec.dailyRange !== null && wanted.has(spec.dailyRange.max)),
    ).map((spec) => spec.type),
  );
}

export function domainsOf(types: ReadonlySet<HealthRecordType>): ReadonlySet<FitnessDomain> {
  const found = new Set<FitnessDomain>();
  for (const spec of SERIES) {
    const domain = GROUP_DOMAIN[spec.group];
    if (
      domain !== undefined &&
      types.has(spec.type) &&
      DOMAIN_INFO[domain].series.includes(spec.key)
    ) {
      found.add(domain);
    }
  }
  if (types.has('ExerciseSession')) {
    found.add('workouts');
  }
  return found;
}

export function seriesWithData(
  types: ReadonlySet<HealthRecordType>,
  keys: readonly string[],
): readonly string[] {
  return keys.filter((key) => SERIES.some((spec) => spec.key === key && types.has(spec.type)));
}
