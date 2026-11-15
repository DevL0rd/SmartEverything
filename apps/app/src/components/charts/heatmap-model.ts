import { captionWidthOf } from './scale';

export interface HeatDay {
  readonly day: string;
  readonly pages: number;
  readonly level: number;
  readonly covered: boolean;
}

export interface CalendarCell {
  readonly day: string;
  readonly column: number;
  readonly row: number;
  readonly level: number;
  readonly covered: boolean;
  readonly today: boolean;
}

export interface CalendarBlock {
  readonly cells: readonly CalendarCell[];
  readonly columns: number;
  readonly span: number;
  readonly starts: readonly MonthStart[];
  readonly crosses: boolean;
}

const MONTHS = [
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
const DAY_MS = 86_400_000;

function weekdayOf(day: string): number {
  return (Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY_MS) + 3) % 7;
}

export function calendarCells(days: readonly HeatDay[], today: string): readonly CalendarCell[] {
  const [first] = days;
  if (first === undefined) return [];
  const offset = weekdayOf(first.day);
  return days.map((entry, index) => ({
    day: entry.day,
    column: Math.floor((index + offset) / 7),
    row: (index + offset) % 7,
    level: entry.level,
    covered: entry.covered,
    today: entry.day === today,
  }));
}

export interface MonthStart {
  readonly column: number;
  readonly key: string;
  readonly month: string;
  readonly year: string;
  readonly january: boolean;
}

export interface BlockLabel {
  readonly column: number;
  readonly text: string;
}

interface KeyedLabel extends BlockLabel {
  readonly start: MonthStart;
  readonly year: boolean;
}

const LABEL_GAP = 8;

function monthStarts(cells: readonly CalendarCell[]): readonly CalendarCell[] {
  const seen = new Set<string>();
  return cells.filter((cell) => {
    const month = cell.day.slice(0, 7);
    if (cell.row > 0 || seen.has(month)) return false;
    seen.add(month);
    return true;
  });
}

function startOf(cell: CalendarCell): MonthStart {
  const index = Number(cell.day.slice(5, 7)) - 1;
  const month = MONTHS[index];
  if (month === undefined) throw new Error(`Calendar day ${cell.day} has no month`);
  return {
    column: cell.column,
    key: cell.day.slice(0, 7),
    month,
    year: cell.day.slice(0, 4),
    january: index === 0,
  };
}

function labelOf(start: MonthStart, year: boolean): KeyedLabel {
  return {
    column: start.column,
    start,
    year,
    text: year ? `${start.month} ${start.year}` : start.month,
  };
}

function crowds(previous: KeyedLabel, label: KeyedLabel, step: number): boolean {
  return (label.column - previous.column) * step < captionWidthOf(previous.text) + LABEL_GAP;
}

function placeLabel(labels: KeyedLabel[], label: KeyedLabel, step: number): void {
  const previous = labels.at(-1);
  if (previous === undefined || !crowds(previous, label, step)) {
    labels.push(label);
    return;
  }
  if (labels.length === 1 && previous.column === 0 && !label.year) {
    labels[0] = labelOf(label.start, previous.year);
    return;
  }
  if (!label.year) return;
  labels.pop();
  const short = labelOf(previous.start, false);
  if (previous.year && !crowds(short, label, step)) {
    labels.push(short, label);
    return;
  }
  placeLabel(labels, label, step);
}

function blockLabelsOf(
  block: CalendarBlock,
  step: number,
  carried: string | undefined,
): readonly KeyedLabel[] {
  const labels: KeyedLabel[] = [];
  for (const start of block.starts) {
    if (labels.length === 0 && start.key === carried) continue;
    const label = labelOf(start, block.crosses && (labels.length === 0 || start.january));
    placeLabel(labels, label, step);
  }
  return labels;
}

export interface LabelledBlock {
  readonly block: CalendarBlock;
  readonly labels: readonly BlockLabel[];
}

export function calendarLabels(
  blocks: readonly CalendarBlock[],
  step: number,
): readonly LabelledBlock[] {
  let carried: string | undefined;
  return blocks.map((block) => {
    const labels = blockLabelsOf(block, step, carried);
    const last = labels.at(-1);
    if (last !== undefined) carried = last.start.key;
    return { block, labels: labels.map(({ column, text }) => ({ column, text })) };
  });
}

function nearestTo(ideal: number, candidates: readonly number[]): number | null {
  return candidates.reduce<number | null>(
    (best, column) =>
      best === null || Math.abs(column - ideal) < Math.abs(best - ideal) ? column : best,
    null,
  );
}

function cutsOf(cells: readonly CalendarCell[], columns: number, parts: number): readonly number[] {
  const starts = monthStarts(cells).map((cell) => cell.column);
  const cuts = [0];
  for (let part = 1; part < parts; part += 1) {
    const previous = cuts.at(-1) ?? 0;
    const ideal = Math.round((part * columns) / parts);
    const nearest = nearestTo(
      ideal,
      starts.filter((column) => column > previous && column < columns),
    );
    cuts.push(nearest ?? Math.max(previous + 1, ideal));
  }
  return [...cuts, columns];
}

export function calendarBlocks(
  cells: readonly CalendarCell[],
  parts: number,
): readonly CalendarBlock[] {
  const last = cells.at(-1);
  if (last === undefined) return [];
  const cuts = cutsOf(cells, last.column + 1, parts);
  const ranges = cuts.slice(1).map((to, index) => ({ from: cuts[index] ?? 0, to }));
  const span = Math.max(...ranges.map((range) => range.to - range.from));
  return ranges
    .map(({ from, to }) => {
      const members = cells
        .filter((cell) => cell.column >= from && cell.column < to)
        .map((cell) => ({ ...cell, column: cell.column - from }));
      return {
        cells: members,
        columns: to - from,
        span,
        starts: monthStarts(members).map(startOf),
        crosses: new Set(members.map((cell) => cell.day.slice(0, 4))).size > 1,
      };
    })
    .filter((block) => block.cells.length > 0);
}

export function heatSummary(days: readonly HeatDay[], unit: string): string {
  if (days.length === 0) return 'No days recorded';
  const active = days.filter((entry) => entry.pages > 0);
  const gaps = days.filter((entry) => !entry.covered).length;
  const busiest = days.reduce(
    (best, entry) => (entry.pages > best.pages ? entry : best),
    days[0] ?? { day: '', pages: 0, level: 0, covered: true },
  );
  const quiet = `${String(active.length)} days with ${unit}`;
  const peak =
    busiest.pages > 0 ? `, busiest ${busiest.day} with ${String(busiest.pages)} ${unit}` : '';
  return `${quiet}${peak}, ${String(gaps)} days not recorded`;
}

export interface HeatRow {
  readonly short: string;
  readonly name: string;
}

export const WEEKDAY_ROWS: readonly HeatRow[] = [
  { short: 'M', name: 'Monday' },
  { short: 'T', name: 'Tuesday' },
  { short: 'W', name: 'Wednesday' },
  { short: 'T', name: 'Thursday' },
  { short: 'F', name: 'Friday' },
  { short: 'S', name: 'Saturday' },
  { short: 'S', name: 'Sunday' },
];

export interface HourCell {
  readonly row: number;
  readonly column: number;
  readonly level: number;
  readonly pages: number;
}

export function hourCells(matrix: readonly (readonly number[])[], levels = 4): readonly HourCell[] {
  const peak = Math.max(0, ...matrix.map((row) => Math.max(0, ...row)));
  return matrix.flatMap((row, rowIndex) =>
    row.map((pages, column) => ({
      row: rowIndex,
      column,
      pages,
      level:
        pages <= 0 || peak === 0
          ? 0
          : Math.max(1, Math.min(levels, Math.ceil((pages / peak) * levels))),
    })),
  );
}

export function hourSummary(
  matrix: readonly (readonly number[])[],
  rows: readonly HeatRow[],
  unit: string,
): string {
  let best = { row: 0, column: 0, pages: 0 };
  matrix.forEach((row, rowIndex) => {
    row.forEach((pages, column) => {
      if (pages > best.pages) best = { row: rowIndex, column, pages };
    });
  });
  if (best.pages === 0) return `No ${unit} by hour yet`;
  const hour = String(best.column).padStart(2, '0');
  const name = rows[best.row]?.name ?? '';
  return `Busiest time ${name} ${hour}:00 with ${String(best.pages)} ${unit}`;
}
