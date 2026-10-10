import type { BodyComposition } from '@smarteverything/domain';
import { dayKeyOf } from '../../../format/time';
import type { WeighedReading } from '../../../store/people';
import { latestFigure } from './daily';
import type { Delta, MetricGlance } from './glance';
import type { DailyFigure } from './points';

export type BodySource =
  | { readonly kind: 'scale'; readonly at: string }
  | { readonly kind: 'health'; readonly day: string };

export interface BodyView {
  readonly weight: number;
  readonly day: string;
  readonly source: BodySource;
  readonly delta: Delta | null;
  readonly against: string;
  readonly bmi: number | null;
  readonly composition: BodyComposition | null;
}

function scaleView(latest: WeighedReading, previous: WeighedReading | undefined): BodyView {
  return {
    weight: latest.weight_kg,
    day: dayKeyOf(Date.parse(latest.measured_at)),
    source: { kind: 'scale', at: latest.measured_at },
    delta:
      previous === undefined
        ? null
        : { change: latest.weight_kg - previous.weight_kg, tone: 'neutral' },
    against: 'last weigh-in',
    bmi: latest.bmi,
    composition: latest.composition,
  };
}

export function bodyViewOf(
  readings: readonly WeighedReading[],
  figures: readonly DailyFigure[],
  glance: MetricGlance,
  day: string,
): BodyView | null {
  const shown = readings.filter((reading) => dayKeyOf(Date.parse(reading.measured_at)) <= day);
  const [latest, previous] = shown;
  const health = latestFigure(figures, 'weight', day);
  if (
    latest !== undefined &&
    (health === null || dayKeyOf(Date.parse(latest.measured_at)) >= health.day)
  ) {
    return scaleView(latest, previous);
  }
  if (health === null) {
    return null;
  }
  return {
    weight: health.value,
    day: health.day,
    source: { kind: 'health', day: health.day },
    delta: glance.delta,
    against: 'last week',
    bmi: null,
    composition: null,
  };
}
