import { dayNumber, type BrushingStats } from '@smarteverything/domain';

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export interface CalendarCell {
  readonly day: string;
  readonly dayOfMonth: number;
  readonly column: number;
  readonly row: number;
  readonly progress: number;
  readonly sessions: number;
}

export function monthCalendar(stats: BrushingStats): readonly CalendarCell[] {
  const first = stats.from;
  const offset = (dayNumber(first) + 3) % 7;
  return stats.buckets.map((bucket, index): CalendarCell => {
    const slot = offset + index;
    return {
      day: bucket.key,
      dayOfMonth: Number(bucket.key.slice(8, 10)),
      column: slot % 7,
      row: Math.floor(slot / 7),
      progress: Math.min(1, bucket.complete / stats.goal.sessionsPerDay),
      sessions: bucket.sessions,
    };
  });
}

export interface HeatCell {
  readonly day: string;
  readonly kind: BrushingStats['heatmap'][number]['kind'];
  readonly column: number;
  readonly row: number;
}

export interface HeatGrid {
  readonly cells: readonly HeatCell[];
  readonly weeks: number;
  readonly months: readonly { readonly column: number; readonly label: string }[];
}

export function heatGrid(stats: BrushingStats): HeatGrid {
  const days = stats.heatmap;
  const first = days[0];
  if (first === undefined) {
    return { cells: [], weeks: 0, months: [] };
  }
  const offset = (dayNumber(first.day) + 3) % 7;
  const cells = days.map((day, index): HeatCell => {
    const slot = offset + index;
    return { day: day.day, kind: day.kind, column: Math.floor(slot / 7), row: slot % 7 };
  });
  const months: { column: number; label: string }[] = [];
  cells.forEach((cell) => {
    if (cell.row === 0 && cell.day.slice(8, 10) <= '07') {
      months.push({
        column: cell.column,
        label: MONTH_NAMES[Number(cell.day.slice(5, 7)) - 1] ?? '',
      });
    }
  });
  return { cells, weeks: (cells.at(-1)?.column ?? 0) + 1, months };
}

export function heatSummary(grid: HeatGrid): string {
  const goal = grid.cells.filter((cell) => cell.kind === 'goal').length;
  const short = grid.cells.filter((cell) => cell.kind === 'short').length;
  return `${String(goal)} goal days, ${String(short)} days stopped early, over ${String(grid.weeks)} weeks`;
}
