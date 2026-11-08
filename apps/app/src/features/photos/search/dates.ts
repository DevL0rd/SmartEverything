import { compareText } from '../../../format/text';
import type { SearchToken } from './tokens';

export type DateToken = Extract<SearchToken, { kind: 'date' }>;

export interface DateContext {
  readonly today: string;
  readonly southern: boolean;
  readonly months: ReadonlyMap<string, number>;
}

export interface DateSuggestion {
  readonly token: DateToken;
  readonly count: number | null;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const SEASONS = ['winter', 'spring', 'summer', 'autumn'] as const;

type Season = (typeof SEASONS)[number];

const NORTH_START: Readonly<Record<Season, number>> = {
  winter: 12,
  spring: 3,
  summer: 6,
  autumn: 9,
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function dayOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dateOf(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

function shift(day: string, days: number): string {
  const date = dateOf(day);
  date.setUTCDate(date.getUTCDate() + days);
  return dayOf(date);
}

function monthStart(year: number, month: number): string {
  return dayOf(new Date(Date.UTC(year, month - 1, 1)));
}

function monthEnd(year: number, month: number): string {
  return dayOf(new Date(Date.UTC(year, month, 0)));
}

function token(from: string, to: string, label: string): DateToken {
  return { kind: 'date', from, to, label };
}

export function monthToken(year: number, month: number): DateToken {
  const name = MONTH_NAMES[month - 1] ?? String(month);
  return token(monthStart(year, month), monthEnd(year, month), `${name} ${String(year)}`);
}

export function yearToken(year: number): DateToken {
  return token(`${String(year)}-01-01`, `${String(year)}-12-31`, String(year));
}

function weekStart(today: string): string {
  const weekday = dateOf(today).getUTCDay();
  return shift(today, -((weekday + 6) % 7));
}

function seasonStartMonth(season: Season, southern: boolean): number {
  const north = NORTH_START[season];
  return southern ? ((north + 5) % 12) + 1 : north;
}

export function lastSeasonToken(season: Season, context: DateContext): DateToken {
  const start = seasonStartMonth(season, context.southern);
  const year = Number(context.today.slice(0, 4));
  const candidates = [year, year - 1, year - 2].map((startYear) => ({
    from: monthStart(startYear, start),
    to: monthEnd(startYear + Math.floor((start + 1) / 12), ((start + 1) % 12) + 1),
  }));
  const ended = candidates.find((range) => range.to < context.today) ?? candidates[2];
  const from = ended?.from ?? context.today;
  const to = ended?.to ?? context.today;
  return token(from, to, `Last ${season}`);
}

function relativeTokens(context: DateContext): readonly DateToken[] {
  const today = context.today;
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const thisWeek = weekStart(today);
  const lastMonth = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  return [
    token(today, today, 'Today'),
    token(shift(today, -1), shift(today, -1), 'Yesterday'),
    token(thisWeek, today, 'This week'),
    token(shift(thisWeek, -7), shift(thisWeek, -1), 'Last week'),
    token(monthStart(year, month), today, 'This month'),
    token(
      monthStart(lastMonth.year, lastMonth.month),
      monthEnd(lastMonth.year, lastMonth.month),
      'Last month',
    ),
    token(`${String(year)}-01-01`, today, 'This year'),
    { ...yearToken(year - 1), label: 'Last year' },
    ...SEASONS.map((season) => lastSeasonToken(season, context)),
  ];
}

function wholeMonths(range: DateToken): readonly string[] | null {
  const startsOnFirst = range.from.endsWith('-01');
  const endYear = Number(range.to.slice(0, 4));
  const endMonth = Number(range.to.slice(5, 7));
  if (!startsOnFirst || range.to !== monthEnd(endYear, endMonth)) return null;
  const months: string[] = [];
  let year = Number(range.from.slice(0, 4));
  let month = Number(range.from.slice(5, 7));
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${String(year)}-${pad(month)}`);
    month = month === 12 ? 1 : month + 1;
    year = month === 1 ? year + 1 : year;
  }
  return months;
}

export function dateCountOf(range: DateToken, context: DateContext): number | null {
  const months = wholeMonths(range);
  if (months === null) return null;
  return months.reduce((sum, month) => sum + (context.months.get(month) ?? 0), 0);
}

function matches(label: string, query: string): boolean {
  const lower = label.toLowerCase();
  return lower.startsWith(query) || lower.split(' ').some((word) => word.startsWith(query));
}

function calendarTokens(query: string, context: DateContext): readonly DateToken[] {
  const years = [...new Set([...context.months.keys()].map((month) => Number(month.slice(0, 4))))];
  const sorted = [...years].sort((left, right) => right - left);
  const yearHits = sorted.filter((year) => String(year).startsWith(query)).map(yearToken);
  const monthHits = [...context.months.keys()]
    .sort((left, right) => compareText(right, left))
    .map((month) => monthToken(Number(month.slice(0, 4)), Number(month.slice(5, 7))))
    .filter((month) => matches(month.label, query) && !/^\d+$/.test(query));
  return [...yearHits, ...monthHits];
}

export function dateSuggestionsOf(text: string, context: DateContext): readonly DateSuggestion[] {
  const query = text.trim().toLowerCase();
  if (query === '') return [];
  const relative = relativeTokens(context).filter((range) => matches(range.label, query));
  return [...relative, ...calendarTokens(query, context)]
    .map((range) => ({ token: range, count: dateCountOf(range, context) }))
    .filter((hit) => hit.count !== 0);
}
