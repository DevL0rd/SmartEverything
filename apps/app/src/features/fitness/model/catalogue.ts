import type { HealthRecordType } from '@smarteverything/domain';
import { SERIES_PART_ONE } from './catalogue-activity';
import { SERIES_PART_TWO } from './catalogue-body';
import type { IconName } from '../../../components/icon';
import { compact, decimal, withUnit } from '../../../format/number';
import type { SeriesGroup, SeriesSpec } from './series-spec';

const COMPACT_FROM = 10_000;

export const SERIES: readonly SeriesSpec[] = [...SERIES_PART_ONE, ...SERIES_PART_TWO];

export interface GroupEntry {
  readonly group: SeriesGroup;
  readonly label: string;
  readonly icon: IconName;
}

export const SERIES_GROUPS: readonly GroupEntry[] = [
  { group: 'activity', label: 'Activity', icon: 'footprints' },
  { group: 'heart', label: 'Heart', icon: 'heartPulse' },
  { group: 'sleep', label: 'Sleep', icon: 'moon' },
  { group: 'vitals', label: 'Vitals', icon: 'droplet' },
  { group: 'body', label: 'Body measurements', icon: 'scale' },
  { group: 'nutrition', label: 'Nutrition', icon: 'apple' },
  { group: 'cycle', label: 'Cycle tracking', icon: 'flower' },
  { group: 'mindfulness', label: 'Mindfulness', icon: 'brain' },
];

export function groupLabel(group: SeriesGroup): string {
  const found = SERIES_GROUPS.find((entry) => entry.group === group);
  if (found === undefined) {
    throw new UnknownSeriesError(group);
  }
  return found.label;
}

class UnknownSeriesError extends Error {
  override readonly name = 'UnknownSeriesError';

  constructor(readonly key: string) {
    super(`There is no health measure called ${key}.`);
  }
}

export function seriesOf(key: string): SeriesSpec {
  const found = SERIES.find((spec) => spec.key === key);
  if (found === undefined) {
    throw new UnknownSeriesError(key);
  }
  return found;
}

export function isSeriesKey(key: string): boolean {
  return SERIES.some((spec) => spec.key === key);
}

export function seriesOfType(type: HealthRecordType): SeriesSpec {
  const found = SERIES.find((spec) => spec.type === type);
  if (found === undefined) {
    throw new UnknownSeriesError(type);
  }
  return found;
}

export function seriesInGroup(group: SeriesGroup): SeriesSpec[] {
  return SERIES.filter((spec) => spec.group === group);
}

function scaled(spec: SeriesSpec, value: number): number {
  return value * spec.scale;
}

export function formatAmount(spec: SeriesSpec, value: number): string {
  const shown = scaled(spec, value);
  return spec.digits === 0 && Math.abs(shown) >= COMPACT_FROM
    ? compact(shown)
    : decimal(shown, spec.digits);
}

export function formatReading(spec: SeriesSpec, value: number): string {
  return withUnit(formatAmount(spec, value), spec.unit);
}
