import { outlierFlags, type Attribution, type BodyComposition } from '@smarteverything/domain';
import type { ChartPoint } from '../../../components/charts';
import { DAY_MS, HOUR_MS } from '../../../format/time';
import type { WeighedReading } from '../../../store/people';

export const NOT_ME_WINDOW_MS = HOUR_MS;
export const STALE_AFTER_MS = 14 * DAY_MS;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;

export interface WeighIn {
  readonly id: string;
  readonly at: number;
  readonly iso: string;
  readonly kg: number;
  readonly bmi: number | null;
  readonly composition: BodyComposition | null;
  readonly attribution: Attribution;
  readonly outlier: boolean;
}

export interface ScaleFacts {
  readonly latest: WeighIn | null;
  readonly latestCounted: WeighIn | null;
  readonly weekDelta: number | null;
  readonly monthDelta: number | null;
  readonly notMe: boolean;
  readonly stale: boolean;
  readonly trend: readonly ChartPoint[];
}

export function weighInsOf(readings: readonly WeighedReading[]): readonly WeighIn[] {
  const ordered = readings
    .map((reading) => ({ reading, at: Date.parse(reading.measured_at) }))
    .sort((left, right) => left.at - right.at);
  const flags = outlierFlags(
    ordered.map(({ reading }) => ({
      weightKg: reading.weight_kg,
      confirmed: reading.attribution === 'person',
    })),
  );
  return ordered.map(({ reading, at }, index) => ({
    id: reading.id,
    at,
    iso: reading.measured_at,
    kg: reading.weight_kg,
    bmi: reading.bmi,
    composition: reading.composition,
    attribution: reading.attribution,
    outlier: flags[index] === true,
  }));
}

export function countedOf(weighIns: readonly WeighIn[]): readonly WeighIn[] {
  return weighIns.filter((weighIn) => !weighIn.outlier);
}

const TENTH = 10;

function deltaOver(counted: readonly WeighIn[], span: number): number | null {
  const latest = counted.at(-1);
  if (latest === undefined) {
    return null;
  }
  const base = counted.find((weighIn) => weighIn.at >= latest.at - span && weighIn !== latest);
  return base === undefined ? null : Math.round((latest.kg - base.kg) * TENTH) / TENTH;
}

export function factsOf(weighIns: readonly WeighIn[], now: number): ScaleFacts {
  const counted = countedOf(weighIns);
  const latest = weighIns.at(-1) ?? null;
  const latestCounted = counted.at(-1) ?? null;
  return {
    latest,
    latestCounted,
    weekDelta: deltaOver(counted, WEEK_MS),
    monthDelta: deltaOver(counted, MONTH_MS),
    notMe: latest !== null && (latest.outlier || now - latest.at < NOT_ME_WINDOW_MS),
    stale: latest !== null && now - latest.at > STALE_AFTER_MS,
    trend: counted.map((weighIn) => ({ t: weighIn.at, v: weighIn.kg })),
  };
}
