import { appendTo } from '@smarteverything/domain';
import { HOUR_MS, startOfDayKey } from '../../../format/time';
import type { DailyFigure } from './points';
import type { Point } from './readers';
import type { SeriesSpec } from './series-spec';

export function figureOn(
  figures: readonly DailyFigure[],
  day: string,
  metric: string,
): number | null {
  return figures.find((figure) => figure.day === day && figure.metric === metric)?.value ?? null;
}

export function baselineOf(
  figures: readonly DailyFigure[],
  day: string,
  metric: string,
): number | null {
  const earlier = figures.filter((figure) => figure.metric === metric && figure.day < day);
  return earlier.length === 0
    ? null
    : earlier.reduce((sum, figure) => sum + figure.value, 0) / earlier.length;
}

export function latestFigure(
  figures: readonly DailyFigure[],
  metric: string,
  upTo: string,
): DailyFigure | null {
  return figures.reduce<DailyFigure | null>(
    (latest, figure) =>
      figure.metric === metric && figure.day <= upTo && (latest === null || figure.day > latest.day)
        ? figure
        : latest,
    null,
  );
}

function middayOf(day: string): number {
  return startOfDayKey(day) + 12 * HOUR_MS;
}

export function pointsOfDaily(spec: SeriesSpec, figures: readonly DailyFigure[]): readonly Point[] {
  const metric = spec.daily;
  if (metric === null) {
    return [];
  }
  const range = spec.dailyRange;
  const byDay = new Map<string, DailyFigure[]>();
  for (const figure of figures) {
    appendTo(byDay, figure.day, figure);
  }
  return figures
    .filter((figure) => figure.metric === metric)
    .map((figure): Point => {
      const at = middayOf(figure.day);
      if (range === null) {
        return { at, value: figure.value, low: figure.value, high: figure.value };
      }
      const sameDay = byDay.get(figure.day) ?? [];
      return {
        at,
        value: figure.value,
        low: figureOn(sameDay, figure.day, range.min) ?? figure.value,
        high: figureOn(sameDay, figure.day, range.max) ?? figure.value,
      };
    })
    .sort((left, right) => left.at - right.at);
}
