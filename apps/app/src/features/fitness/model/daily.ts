import type { DailyFigure } from './points';

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

export function seriesFor(
  figures: readonly DailyFigure[],
  metric: string,
  days: readonly string[],
): (number | null)[] {
  return days.map((day) => figureOn(figures, day, metric));
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
