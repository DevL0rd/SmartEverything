import type { BottleDrinkRow, BottleReadingRow, BottleToday } from '@smarteverything/domain';
import { minutesOfDay } from '../../../format/time';

export interface LevelPoint {
  readonly minute: number;
  readonly ml: number;
  readonly rejected: boolean;
}

export interface DrinkMark {
  readonly minute: number;
  readonly ml: number;
  readonly fill: boolean;
  readonly entryId: string | null;
  readonly levelMl: number | null;
}

interface CumulativePoint {
  readonly minute: number;
  readonly ml: number;
}

export const MINUTES_PER_DAY = 1440;

export function minuteOf(iso: string): number {
  return minutesOfDay(Date.parse(iso));
}

export function levelPoints(rows: readonly BottleReadingRow[]): readonly LevelPoint[] {
  return rows
    .filter((row) => row.volumeMl !== null)
    .map((row) => ({
      minute: minuteOf(row.at),
      ml: row.volumeMl ?? 0,
      rejected: row.verdict !== 'accepted',
    }))
    .sort((left, right) => left.minute - right.minute);
}

export function acceptedLevels(points: readonly LevelPoint[]): readonly LevelPoint[] {
  return points.filter((point) => !point.rejected);
}

function markOf(row: BottleDrinkRow): DrinkMark {
  return {
    minute: minuteOf(row.at),
    ml: row.ml,
    fill: row.kind === 'fill',
    entryId: row.entryId,
    levelMl: row.levelMl,
  };
}

export function drinkMarks(today: BottleToday): readonly DrinkMark[] {
  return [...today.drinks, ...today.fills]
    .map(markOf)
    .sort((left, right) => left.minute - right.minute);
}

export function levelTrail(today: BottleToday): readonly LevelPoint[] {
  const accepted = acceptedLevels(levelPoints(today.levels));
  if (accepted.length > 0) {
    return accepted;
  }
  return drinkMarks(today).flatMap((mark) =>
    mark.levelMl === null ? [] : [{ minute: mark.minute, ml: mark.levelMl, rejected: false }],
  );
}

export function markNear(
  marks: readonly DrinkMark[],
  minute: number,
  toleranceMinutes: number,
): DrinkMark | null {
  return marks
    .filter((mark) => mark.entryId !== null && Math.abs(mark.minute - minute) <= toleranceMinutes)
    .reduce<DrinkMark | null>(
      (best, mark) =>
        best === null || Math.abs(mark.minute - minute) < Math.abs(best.minute - minute)
          ? mark
          : best,
      null,
    );
}

export function cumulativeOf(today: BottleToday): readonly CumulativePoint[] {
  let total = 0;
  const steps = today.drinks
    .map(markOf)
    .sort((left, right) => left.minute - right.minute)
    .map((drink) => {
      total += drink.ml;
      return { minute: drink.minute, ml: total };
    });
  return [{ minute: 0, ml: 0 }, ...steps];
}

export interface HourBar {
  readonly key: string;
  readonly value: number;
  readonly label: string;
}

export function hourBars(today: BottleToday): readonly HourBar[] {
  return today.hourly.map((value, hour) => ({
    key: String(hour).padStart(2, '0'),
    value,
    label: hour % 6 === 0 ? String(hour).padStart(2, '0') : '',
  }));
}

export function peakHour(today: BottleToday): string | undefined {
  const peak = Math.max(...today.hourly);
  return peak <= 0 ? undefined : String(today.hourly.indexOf(peak)).padStart(2, '0');
}

export function chartSummary(today: BottleToday): string {
  const drinks = today.drinks.length;
  const fills = today.fills.length;
  const parts = [
    `${String(drinks)} ${drinks === 1 ? 'drink' : 'drinks'} from the bottle today`,
    fills === 0 ? null : `${String(fills)} ${fills === 1 ? 'refill' : 'refills'}`,
  ];
  return `${parts.filter((part) => part !== null).join(', ')}.`;
}
