import type { PhotoInsightRange, PhotoInsights } from '@smarteverything/domain';
import type { HeatDay } from '../../../components/charts';
import type { HeatRow } from '../../../components/charts/heatmap-model';
import { count } from '../../../format/number';
import { shiftDay, shortDate, startOfDayKey } from '../../../format/time';

const LEVELS = 4;

const HOURS = 24;

const MONTHS_SHOWN = 12;

export const WEEK_ROWS: readonly HeatRow[] = [
  { short: 'Mon', name: 'Monday' },
  { short: 'Tue', name: 'Tuesday' },
  { short: 'Wed', name: 'Wednesday' },
  { short: 'Thu', name: 'Thursday' },
  { short: 'Fri', name: 'Friday' },
  { short: 'Sat', name: 'Saturday' },
  { short: 'Sun', name: 'Sunday' },
];

type Season = PhotoInsights['seasonByHour'][number]['season'];

const SEASON_ORDER: readonly Season[] = ['winter', 'spring', 'summer', 'autumn'];

const SEASON_NAME: Readonly<Record<Season, string>> = {
  winter: 'Winter',
  spring: 'Spring',
  summer: 'Summer',
  autumn: 'Autumn',
};

export const SEASON_ROWS: readonly HeatRow[] = SEASON_ORDER.map((season) => ({
  short: SEASON_NAME[season],
  name: SEASON_NAME[season].toLowerCase(),
}));

function levelOf(value: number, peak: number): number {
  if (value <= 0 || peak === 0) return 0;
  return Math.max(1, Math.min(LEVELS, Math.ceil((value / peak) * LEVELS)));
}

function twelveMonthsFrom(today: string): string {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)) - (MONTHS_SHOWN - 1);
  const shifted = new Date(Date.UTC(year, month - 1, 1));
  return shifted.toISOString().slice(0, 10);
}

export function calendarFrom(range: PhotoInsightRange, today: string): string {
  const window = twelveMonthsFrom(today);
  if (range !== 'this_year') return window;
  const january = `${today.slice(0, 4)}-01-01`;
  return january > window ? january : window;
}

export function heatDays(
  perDay: PhotoInsights['perDay'],
  from: string,
  today: string,
): readonly HeatDay[] {
  const items = new Map(perDay.map((entry) => [entry.day, entry.items]));
  const peak = perDay.reduce((top, entry) => Math.max(top, entry.items), 0);
  const days: HeatDay[] = [];
  for (let day = from; day <= today; day = shiftDay(day, 1)) {
    const value = items.get(day) ?? 0;
    days.push({ day, pages: value, level: levelOf(value, peak), covered: true });
  }
  return days;
}

export function busiestLine(busiest: PhotoInsights['busiestDays']): string | null {
  const [top] = busiest;
  if (top === undefined || top.items === 0) return null;
  const photos = top.items === 1 ? '1 photo' : `${count(top.items)} photos`;
  return `Busiest day ${shortDate(startOfDayKey(top.day))}, ${photos}`;
}

export function weekMatrix(cells: PhotoInsights['weekdayByHour']): readonly (readonly number[])[] {
  const matrix = WEEK_ROWS.map(() => new Array<number>(HOURS).fill(0));
  for (const cell of cells) {
    const row = matrix[cell.weekday];
    if (row !== undefined) row[cell.hour] = cell.items;
  }
  return matrix;
}

export function seasonMatrix(cells: PhotoInsights['seasonByHour']): readonly (readonly number[])[] {
  const matrix = SEASON_ORDER.map(() => new Array<number>(HOURS).fill(0));
  for (const cell of cells) {
    const row = matrix[SEASON_ORDER.indexOf(cell.season)];
    if (row !== undefined) row[cell.hour] = cell.items;
  }
  return matrix;
}

interface Peak {
  readonly row: number;
  readonly hour: number;
  readonly items: number;
}

function peakOf(matrix: readonly (readonly number[])[]): Peak {
  let best: Peak = { row: 0, hour: 0, items: 0 };
  matrix.forEach((row, index) => {
    row.forEach((items, hour) => {
      if (items > best.items) best = { row: index, hour, items };
    });
  });
  return best;
}

export function partOfDay(hour: number): string {
  if (hour < 5) return 'nights';
  if (hour < 12) return 'mornings';
  if (hour < 17) return 'afternoons';
  return hour < 21 ? 'evenings' : 'nights';
}

export function weekLine(matrix: readonly (readonly number[])[]): string | null {
  const peak = peakOf(matrix);
  if (peak.items === 0) return null;
  return `Most photos on ${WEEK_ROWS[peak.row]?.name ?? ''} ${partOfDay(peak.hour)}`;
}

export function seasonLine(matrix: readonly (readonly number[])[]): string | null {
  const peak = peakOf(matrix);
  if (peak.items === 0) return null;
  const hour = `${String(peak.hour).padStart(2, '0')}:00`;
  return `Most photos around ${hour} in ${SEASON_ROWS[peak.row]?.name ?? ''}`;
}

export interface YoungLibrary {
  readonly share: number;
  readonly days: number;
  readonly ready: string;
}

export function youngLibrary(perDay: PhotoInsights['perDay'], today: string): YoungLibrary | null {
  const first = perDay[0]?.day;
  if (first === undefined) return null;
  const ready = new Date(startOfDayKey(first));
  ready.setMonth(ready.getMonth() + 2);
  const span = ready.getTime() - startOfDayKey(first);
  const done = startOfDayKey(today) - startOfDayKey(first);
  return {
    share: span <= 0 ? 0 : Math.min(1, Math.max(0, done / span)),
    days: Math.round(done / 86_400_000),
    ready: shortDate(ready),
  };
}
