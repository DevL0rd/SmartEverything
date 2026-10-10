import type { HealthMetric, HealthRecordType } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import type { ColourRole } from '../../../design/tokens';

export type SeriesGroup =
  'activity' | 'heart' | 'sleep' | 'vitals' | 'body' | 'nutrition' | 'cycle' | 'mindfulness';

export type Combine = 'sum' | 'mean' | 'latest';

export type Better = 'higher' | 'lower' | 'neither';

type ChartKind = 'bars' | 'line' | 'range';

type SeriesRead =
  | { readonly kind: 'field'; readonly field: string; readonly second?: string }
  | { readonly kind: 'samples'; readonly list: string; readonly field: string }
  | { readonly kind: 'duration' }
  | { readonly kind: 'occurrence' };

export interface SeriesSpec {
  readonly key: string;
  readonly label: string;
  readonly short?: string;
  readonly type: HealthRecordType;
  readonly daily: HealthMetric | null;
  readonly dailyRange: { readonly min: HealthMetric; readonly max: HealthMetric } | null;
  readonly read: SeriesRead;
  readonly unit: string;
  readonly scale: number;
  readonly digits: number;
  readonly combine: Combine;
  readonly better: Better;
  readonly chart: ChartKind;
  readonly group: SeriesGroup;
  readonly icon: IconName;
  readonly colour: ColourRole;
  readonly keywords: readonly string[];
}

type SpecDefaults = Pick<SeriesSpec, 'daily' | 'dailyRange' | 'scale' | 'digits' | 'keywords'>;

const DEFAULTS: SpecDefaults = { daily: null, dailyRange: null, scale: 1, digits: 0, keywords: [] };

export function spec(
  given: Omit<SeriesSpec, keyof SpecDefaults> & Partial<SpecDefaults>,
): SeriesSpec {
  return { ...DEFAULTS, ...given };
}
