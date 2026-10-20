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
  readonly labels: readonly { readonly column: number; readonly text: string }[];
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

function labelsOf(cells: readonly CalendarCell[]): CalendarBlock['labels'] {
  const seen = new Set<string>();
  return cells.flatMap((cell) => {
    const month = cell.day.slice(0, 7);
    if (cell.row > 0 || seen.has(month)) return [];
    seen.add(month);
    return [{ column: cell.column, text: MONTHS[Number(cell.day.slice(5, 7)) - 1] ?? '' }];
  });
}

export function calendarBlocks(
  cells: readonly CalendarCell[],
  parts: number,
): readonly CalendarBlock[] {
  const last = cells.at(-1);
  if (last === undefined) return [];
  const columns = last.column + 1;
  const perPart = Math.ceil(columns / parts);
  return Array.from({ length: parts }, (_, part) => {
    const from = part * perPart;
    const members = cells
      .filter((cell) => cell.column >= from && cell.column < from + perPart)
      .map((cell) => ({ ...cell, column: cell.column - from }));
    return {
      cells: members,
      columns: Math.min(perPart, columns - from),
      labels: labelsOf(members),
    };
  }).filter((block) => block.cells.length > 0);
}

export function heatSummary(days: readonly HeatDay[]): string {
  if (days.length === 0) return 'No days recorded';
  const printed = days.filter((entry) => entry.pages > 0);
  const gaps = days.filter((entry) => !entry.covered).length;
  const busiest = days.reduce(
    (best, entry) => (entry.pages > best.pages ? entry : best),
    days[0] ?? { day: '', pages: 0, level: 0, covered: true },
  );
  const quiet = `${String(printed.length)} printing days`;
  const peak =
    busiest.pages > 0 ? `, busiest ${busiest.day} with ${String(busiest.pages)} pages` : '';
  return `${quiet}${peak}, ${String(gaps)} days not recorded`;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

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

export function hourSummary(matrix: readonly (readonly number[])[]): string {
  let best = { row: 0, column: 0, pages: 0 };
  matrix.forEach((row, rowIndex) => {
    row.forEach((pages, column) => {
      if (pages > best.pages) best = { row: rowIndex, column, pages };
    });
  });
  if (best.pages === 0) return 'No printing by hour yet';
  const hour = String(best.column).padStart(2, '0');
  return `Busiest time ${WEEKDAYS[best.row] ?? ''} ${hour}:00 with ${String(best.pages)} pages`;
}

export const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;
