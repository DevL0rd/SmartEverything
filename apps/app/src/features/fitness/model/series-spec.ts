import type { HealthMetric, HealthRecord, HealthRecordType } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import type { ColourRole } from '../../../design/tokens';
import { isTypedRecord, readPoints, type Point, type ReadKind, type SeriesRead } from './readers';

export type SeriesGroup =
  'activity' | 'heart' | 'sleep' | 'vitals' | 'body' | 'nutrition' | 'cycle' | 'mindfulness';

type Combine = 'sum' | 'mean' | 'latest';

export type Better = 'higher' | 'lower' | 'neither';

type ChartKind = 'bars' | 'line' | 'range';

export interface SeriesSpec {
  readonly key: string;
  readonly label: string;
  readonly short?: string;
  readonly type: HealthRecordType;
  readonly daily: HealthMetric | null;
  readonly dailyRange: { readonly min: HealthMetric; readonly max: HealthMetric } | null;
  readonly read: ReadKind;
  readonly pointsOf: (record: HealthRecord) => readonly Point[];
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

type SpecInput<T extends HealthRecordType> = Omit<
  SeriesSpec,
  keyof SpecDefaults | 'type' | 'read' | 'pointsOf'
> &
  Partial<SpecDefaults> & { readonly type: T; readonly read: SeriesRead<T> };

export function spec<T extends HealthRecordType>(given: SpecInput<T>): SeriesSpec {
  const { read, type, ...rest } = given;
  return {
    ...DEFAULTS,
    ...rest,
    type,
    read: read.kind,
    pointsOf: (record) => (isTypedRecord(record, type) ? readPoints(read, record) : []),
  };
}

export function isOccurrence(series: SeriesSpec): boolean {
  return series.read === 'occurrence';
}
