import type { HealthMetric } from '@smarteverything/domain';
import type { FillValue } from '../../../components/charts';
import { shiftDay } from '../../../format/time';
import { figureOn, latestFigure } from './daily';
import type { DailyFigure } from './points';
import type { Better } from './series-spec';

export type DeltaTone = 'positive' | 'critical' | 'neutral';

export interface Delta {
  readonly change: number;
  readonly tone: DeltaTone;
}

export interface MetricGlance {
  readonly latest: { readonly day: string; readonly value: number } | null;
  readonly values: readonly FillValue[];
  readonly average: number | null;
  readonly low: number | null;
  readonly high: number | null;
  readonly delta: Delta | null;
}

const BASELINE_DAYS = 7;

function meanOf(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toneOf(change: number, better: Better, reference: number): DeltaTone {
  if (better === 'neither' || Math.abs(change) < Math.abs(reference) * 0.01) {
    return 'neutral';
  }
  const up = change > 0;
  return up === (better === 'higher') ? 'positive' : 'critical';
}

function deltaOf(
  figures: readonly DailyFigure[],
  metric: HealthMetric,
  latest: DailyFigure,
  better: Better,
): Delta | null {
  const first = shiftDay(latest.day, -BASELINE_DAYS);
  const before = figures
    .filter((figure) => figure.metric === metric && figure.day < latest.day && figure.day >= first)
    .map((figure) => figure.value);
  const baseline = meanOf(before);
  if (baseline === null) {
    return null;
  }
  const change = latest.value - baseline;
  return { change, tone: toneOf(change, better, baseline) };
}

export interface GlanceRequest {
  readonly metric: HealthMetric;
  readonly day: string;
  readonly days: number;
  readonly better: Better;
}

export function glanceOf(
  figures: readonly DailyFigure[],
  { metric, day, days, better }: GlanceRequest,
): MetricGlance {
  const keys = Array.from({ length: days }, (_, index) => shiftDay(day, index - days + 1));
  const values = keys.map((key) => ({ key, value: figureOn(figures, key, metric) }));
  const known = values.flatMap((item) => (item.value === null ? [] : [item.value]));
  const latest = latestFigure(figures, metric, day);
  return {
    latest: latest === null ? null : { day: latest.day, value: latest.value },
    values,
    average: meanOf(known),
    low: known.length === 0 ? null : Math.min(...known),
    high: known.length === 0 ? null : Math.max(...known),
    delta: latest === null ? null : deltaOf(figures, metric, latest, better),
  };
}
