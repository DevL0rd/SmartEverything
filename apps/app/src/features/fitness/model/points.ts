import { preferredShares, type HealthRecord } from '@smarteverything/domain';
import type { Point } from './readers';
import type { SeriesSpec } from './series-spec';

export interface DailyFigure {
  readonly day: string;
  readonly metric: string;
  readonly value: number;
}

function scaled(point: Point, share: number): Point {
  return share === 1
    ? point
    : {
        at: point.at,
        value: point.value * share,
        low: point.low * share,
        high: point.high * share,
      };
}

export function pointsOfRecords(
  spec: SeriesSpec,
  records: readonly HealthRecord[],
): readonly Point[] {
  return preferredShares(records.filter((record) => record.type === spec.type))
    .flatMap(({ record, share }) => spec.pointsOf(record).map((point) => scaled(point, share)))
    .sort((left, right) => left.at - right.at);
}
