import type { HealthRecord } from '@smarteverything/domain';
import type { Point } from './readers';
import type { SeriesSpec } from './series-spec';

export interface DailyFigure {
  readonly day: string;
  readonly metric: string;
  readonly value: number;
}

export function pointsOfRecords(
  spec: SeriesSpec,
  records: readonly HealthRecord[],
): readonly Point[] {
  return records
    .flatMap((record) => spec.pointsOf(record))
    .sort((left, right) => left.at - right.at);
}
