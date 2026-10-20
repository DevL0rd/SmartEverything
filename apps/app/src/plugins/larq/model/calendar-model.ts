import { bottleDayAfter, type BottleStats } from '@smarteverything/domain';
import { shortDate, startOfDayKey, weekdayShort } from '../../../format/time';
import type { HeatCell } from './stats-model';

export interface StreakMark {
  readonly days: ReadonlySet<string>;
  readonly end: string | null;
}

export function streakMarkOf(streak: BottleStats['streak'], today: string): StreakMark {
  if (streak.current === 0) {
    return { days: new Set(), end: null };
  }
  const end = streak.atRisk ? bottleDayAfter(today, -1) : today;
  return {
    days: new Set(Array.from({ length: streak.current }, (_, back) => bottleDayAfter(end, -back))),
    end,
  };
}

export interface HeatPoint {
  readonly x: number;
  readonly y: number;
}

export interface HeatLayout {
  readonly step: number;
  readonly top: number;
  readonly rowStep: number;
}

export function dayAtPoint(
  cells: readonly HeatCell[],
  layout: HeatLayout,
  point: HeatPoint,
): string | null {
  const week = Math.floor(point.x / layout.step);
  const row = Math.floor((point.y - layout.top) / layout.rowStep);
  return cells.find((cell) => cell.week === week && cell.row === row)?.day ?? null;
}

export function dayHeading(day: string): string {
  const start = startOfDayKey(day);
  return `${weekdayShort(start)} ${shortDate(start)}`;
}
