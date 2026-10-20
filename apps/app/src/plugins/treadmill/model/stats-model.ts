import {
  addDays,
  dayNumber,
  type StatsBucket,
  type StatsRange,
  type TreadmillStats,
} from '@smarteverything/domain';
import { decimal } from '../../../format/number';

export const RANGE_OPTIONS: readonly { readonly value: StatsRange; readonly label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'] as const;

const MONTH_LABEL_EVERY = 5;

const HOUR_LABEL_EVERY = 6;

export function bucketLabel(range: StatsRange, key: string): string {
  switch (range) {
    case 'day': {
      const hour = Number(key.slice(11, 13));
      return hour % HOUR_LABEL_EVERY === 0 ? String(hour) : '';
    }
    case 'week':
      return WEEKDAYS[(dayNumber(key) + 3) % 7] ?? '';
    case 'month': {
      const day = Number(key.slice(8, 10));
      return day === 1 || day % MONTH_LABEL_EVERY === 0 ? String(day) : '';
    }
    case 'year':
      return MONTHS[Number(key.slice(5, 7)) - 1] ?? '';
  }
}

export type Metric = 'distance' | 'time' | 'steps' | 'kcal' | 'climb';

export function metricOf(bucket: StatsBucket, metric: Metric): number {
  switch (metric) {
    case 'distance':
      return bucket.distanceM / 1000;
    case 'time':
      return bucket.activeSeconds / 60;
    case 'steps':
      return bucket.steps;
    case 'kcal':
      return bucket.kcal;
    case 'climb':
      return bucket.climbM;
  }
}

export function deltaText(delta: number | null): string {
  if (delta === null) {
    return 'New';
  }
  const rounded = Math.round(delta);
  if (rounded === 0) {
    return 'Same';
  }
  return `${rounded > 0 ? '+' : '−'}${String(Math.abs(rounded))}%`;
}

export type DeltaTone = 'positive' | 'neutral' | 'critical';

export function deltaTone(delta: number | null): DeltaTone {
  if (delta === null || Math.round(delta) === 0) {
    return 'neutral';
  }
  return delta > 0 ? 'positive' : 'critical';
}

export function minutesText(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${String(minutes)} min`;
  }
  return `${String(Math.floor(minutes / 60))} h ${String(minutes % 60).padStart(2, '0')} min`;
}

export function kilometresText(metres: number): string {
  return `${decimal(metres / 1000, metres >= 100_000 ? 0 : 1)} km`;
}

export interface AverageLines {
  readonly short: readonly number[];
  readonly long: readonly number[];
}

export function averageLinesOf(
  range: StatsRange,
  stats: TreadmillStats,
  metric: Metric,
): AverageLines | null {
  const fits =
    metric === 'distance' &&
    (range === 'week' || range === 'month') &&
    stats.average7.length === stats.buckets.length &&
    stats.average30.length === stats.buckets.length;
  if (!fits) {
    return null;
  }
  return {
    short: stats.average7.map((metres) => metres / 1000),
    long: stats.average30.map((metres) => metres / 1000),
  };
}

export interface HeatCell {
  readonly day: string;
  readonly level: number;
  readonly distanceM: number;
  readonly column: number;
  readonly row: number;
}

export function heatCells(
  days: TreadmillStats['heatmap'],
  weeks: number,
  today: string,
): readonly HeatCell[] {
  const byDay = new Map(days.map((entry) => [entry.day, entry]));
  const weekday = (dayNumber(today) + 3) % 7;
  const lastColumn = weeks - 1;
  const first = addDays(today, -(weekday + lastColumn * 7));
  return Array.from({ length: weeks * 7 }, (_, index) => {
    const column = Math.floor(index / 7);
    const row = index % 7;
    const day = addDays(first, index);
    const entry = byDay.get(day);
    return {
      day,
      level: day > today ? -1 : (entry?.level ?? 0),
      distanceM: entry?.distanceM ?? 0,
      column,
      row,
    };
  }).filter((cell) => cell.level >= 0);
}

export function heatSummary(cells: readonly HeatCell[]): string {
  const active = cells.filter((cell) => cell.level > 0);
  const distance = active.reduce((sum, cell) => sum + cell.distanceM, 0);
  return `${String(active.length)} active days, ${kilometresText(distance)}`;
}

const LANDMARK_FROM_M = 300;

const EIFFEL_TOWER_M = 330;

export function landmarkLine(climbM: number): string | null {
  if (climbM <= LANDMARK_FROM_M) {
    return null;
  }
  const towers = climbM / EIFFEL_TOWER_M;
  return towers < 1.5
    ? 'About as high as the Eiffel Tower'
    : `As high as ${decimal(towers, 1)} Eiffel Towers`;
}
