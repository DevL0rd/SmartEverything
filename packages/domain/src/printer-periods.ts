import { HEAT_LEVELS } from './treadmill-stats';
import {
  addDays,
  bucketKeysOf,
  dayNumber,
  daysIn,
  previousWindowOf,
  windowOf,
  type DayWindow,
  type StatsRange,
} from './treadmill-days';
import type { PrinterBucket, PrinterDay, PrinterStats, PrinterTotals } from './printer-stats';

export const PRINTER_AVERAGE_SHORT = 7;

export const PRINTER_AVERAGE_LONG = 30;

export const PRINTER_HEATMAP_DAYS = 365;

const PAGES_PER_JOB_EDGES: readonly (readonly [number, string])[] = [
  [1, '1'],
  [3, '2-3'],
  [10, '4-10'],
  [30, '11-30'],
  [Number.POSITIVE_INFINITY, '31+'],
];

export interface PeriodsRequest {
  readonly days: readonly PrinterDay[];
  readonly jobPages: readonly number[];
  readonly period: StatsRange;
  readonly anchor: string;
  readonly today: string;
  readonly firstDay: string;
  readonly lifetimePages: number | null;
}

export type DayStanding = 'printed' | 'free' | 'unknown';

function printedOn(day: PrinterDay): boolean {
  return day.jobs > 0 || day.pages > 0 || (day.estimatedPages ?? 0) > 0;
}

export function dayStanding(
  day: PrinterDay | undefined,
  key: string,
  firstDay: string,
): DayStanding {
  if (key < firstDay) return 'unknown';
  if (day === undefined) return 'free';
  if (printedOn(day)) return 'printed';
  return day.gaps.length === 0 ? 'free' : 'unknown';
}

export function isCovered(day: PrinterDay | undefined, key: string, firstDay: string): boolean {
  return key >= firstDay && (day?.gaps.length ?? 0) === 0;
}

const BLANK_DAY: PrinterDay = {
  day: '',
  jobs: 0,
  canceled: 0,
  failed: 0,
  pages: 0,
  sheets: 0,
  mono: 0,
  color: 0,
  duplexPages: 0,
  activeSeconds: 0,
  onlineSeconds: 0,
  offlineSeconds: 0,
  restarts: 0,
  errors: 0,
  jams: 0,
  hours: new Array<number>(24).fill(0),
  counterPages: null,
  estimatedPages: null,
  gaps: [],
};

export function totalsOf(
  days: ReadonlyMap<string, PrinterDay>,
  window: DayWindow,
  firstDay: string,
): PrinterTotals {
  const sum = {
    pages: 0,
    jobs: 0,
    sheets: 0,
    color: 0,
    mono: 0,
    duplexPages: 0,
    notAttributed: 0,
    coveredDays: 0,
  };
  for (const key of daysIn(window)) {
    const day = days.get(key);
    const row = day ?? BLANK_DAY;
    sum.pages += row.pages;
    sum.jobs += row.jobs;
    sum.sheets += row.sheets;
    sum.color += row.color;
    sum.mono += row.mono;
    sum.duplexPages += row.duplexPages;
    sum.notAttributed += row.estimatedPages ?? 0;
    sum.coveredDays += isCovered(day, key, firstDay) ? 1 : 0;
  }
  const coloured = sum.color + sum.mono;
  return {
    ...sum,
    colorShare: coloured === 0 ? null : sum.color / coloured,
    duplexShare: sum.pages === 0 ? null : sum.duplexPages / sum.pages,
    paperSaved: Math.floor(sum.duplexPages / 2),
  };
}

function percentChange(now: number, before: number): number | null {
  return before === 0 ? null : (now - before) / before;
}

function shareChange(now: number | null, before: number | null): number | null {
  return now === null || before === null ? null : now - before;
}

export function deltaOf(now: PrinterTotals, before: PrinterTotals): PrinterStats['delta'] {
  return {
    pages: percentChange(now.pages, before.pages),
    jobs: percentChange(now.jobs, before.jobs),
    sheets: percentChange(now.sheets, before.sheets),
    colorShare: shareChange(now.colorShare, before.colorShare),
    duplexShare: shareChange(now.duplexShare, before.duplexShare),
    paperSaved: percentChange(now.paperSaved, before.paperSaved),
  };
}

function bucketKeyOfDay(period: StatsRange, key: string): string {
  return period === 'year' ? key.slice(0, 7) : key;
}

function bucketOf(
  key: string,
  days: ReadonlyMap<string, PrinterDay>,
  members: readonly string[],
  firstDay: string,
): PrinterBucket {
  const bucket = { key, pages: 0, jobs: 0, color: 0, mono: 0, covered: true };
  for (const member of members) {
    const day = days.get(member);
    const row = day ?? BLANK_DAY;
    bucket.pages += row.pages;
    bucket.jobs += row.jobs;
    bucket.color += row.color;
    bucket.mono += row.mono;
    bucket.covered = bucket.covered && isCovered(day, member, firstDay);
  }
  return bucket;
}

export function bucketsOf(
  days: ReadonlyMap<string, PrinterDay>,
  period: StatsRange,
  window: DayWindow,
  firstDay: string,
): PrinterBucket[] {
  if (period === 'day') return hourBuckets(days.get(window.from), window.from, firstDay);
  const members = daysIn(window);
  return bucketKeysOf(period, window).map((key) =>
    bucketOf(
      key,
      days,
      members.filter((member) => bucketKeyOfDay(period, member) === key),
      firstDay,
    ),
  );
}

function hourBuckets(day: PrinterDay | undefined, key: string, firstDay: string): PrinterBucket[] {
  const covered = isCovered(day, key, firstDay);
  return Array.from({ length: 24 }, (_, hour) => ({
    key: `${key}T${String(hour).padStart(2, '0')}`,
    pages: day?.hours[hour] ?? 0,
    jobs: 0,
    color: 0,
    mono: 0,
    covered,
  }));
}

function lastDayOf(period: StatsRange, key: string, window: DayWindow): string {
  if (period === 'day') return window.from;
  if (period === 'year') return addDays(`${key}-01`, daysInMonth(key) - 1);
  return key;
}

function daysInMonth(month: string): number {
  return new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
}

export function averageOf(
  days: ReadonlyMap<string, PrinterDay>,
  endDay: string,
  length: number,
): number {
  let sum = 0;
  for (let offset = 0; offset < length; offset += 1) {
    sum += days.get(addDays(endDay, -offset))?.pages ?? 0;
  }
  return sum / length;
}

export function averagesOf(
  days: ReadonlyMap<string, PrinterDay>,
  span: { readonly period: StatsRange; readonly window: DayWindow; readonly today: string },
  buckets: readonly PrinterBucket[],
  length: number,
): number[] {
  return buckets.map((bucket) => {
    const keyDay = span.period === 'day' ? span.window.from : bucket.key;
    const end = lastDayOf(span.period, keyDay, span.window);
    return averageOf(days, end > span.today ? span.today : end, length);
  });
}

export function heatLevel(value: number, peak: number): number {
  if (value <= 0 || peak <= 0) return 0;
  return Math.max(1, Math.min(HEAT_LEVELS, Math.ceil((value / peak) * HEAT_LEVELS)));
}

export function heatmapOf(
  days: ReadonlyMap<string, PrinterDay>,
  today: string,
  firstDay: string,
): PrinterStats['heatmap'] {
  const keys = daysIn({ from: addDays(today, 1 - PRINTER_HEATMAP_DAYS), to: today });
  const peak = Math.max(0, ...keys.map((key) => days.get(key)?.pages ?? 0));
  return keys.map((key) => {
    const day = days.get(key);
    const pages = day?.pages ?? 0;
    return {
      day: key,
      pages,
      level: heatLevel(pages, peak),
      covered: isCovered(day, key, firstDay),
    };
  });
}

function weekdayOf(key: string): number {
  return (dayNumber(key) + 3) % 7;
}

export function weekdayHourOf(
  days: ReadonlyMap<string, PrinterDay>,
  today: string,
): PrinterStats['weekdayHour'] {
  const keys = daysIn({ from: addDays(today, 1 - PRINTER_HEATMAP_DAYS), to: today });
  return Array.from({ length: 7 }, (_, weekday) => {
    const members = keys.filter((key) => weekdayOf(key) === weekday);
    return Array.from({ length: 24 }, (_unused, hour) =>
      members.reduce((sum, key) => sum + (days.get(key)?.hours[hour] ?? 0), 0),
    );
  });
}

function streakOf(
  days: ReadonlyMap<string, PrinterDay>,
  wanted: DayStanding,
  request: Pick<PeriodsRequest, 'today' | 'firstDay'>,
): PrinterStats['printFree'] {
  let longest = 0;
  let run = 0;
  for (const key of daysIn({ from: request.firstDay, to: request.today })) {
    const standing = dayStanding(days.get(key), key, request.firstDay);
    if (standing === wanted) run += 1;
    else if (standing !== 'unknown') run = 0;
    longest = Math.max(longest, run);
  }
  return { current: run, longest };
}

function pagesPerJobOf(jobPages: readonly number[]): PrinterStats['pagesPerJob'] {
  return PAGES_PER_JOB_EDGES.map(([edge, label], index) => {
    const low = PAGES_PER_JOB_EDGES[index - 1]?.[0] ?? 0;
    return { label, jobs: jobPages.filter((pages) => pages > low && pages <= edge).length };
  });
}

function busiestOf(days: readonly PrinterDay[]): PrinterStats['busiestDay'] {
  let best: PrinterStats['busiestDay'] = null;
  for (const day of days) {
    if (day.pages > (best?.pages ?? 0)) best = { day: day.day, pages: day.pages };
  }
  return best;
}

function reliabilityOf(
  days: readonly PrinterDay[],
  window: DayWindow,
): PrinterStats['reliability'] {
  const inside = days.filter((day) => day.day >= window.from && day.day <= window.to);
  const online = inside.reduce((sum, day) => sum + day.onlineSeconds, 0);
  const observed = online + inside.reduce((sum, day) => sum + day.offlineSeconds, 0);
  const months = new Map<string, { jams: number; errors: number }>();
  for (const day of days) {
    const entry = months.get(day.day.slice(0, 7)) ?? { jams: 0, errors: 0 };
    months.set(day.day.slice(0, 7), {
      jams: entry.jams + day.jams,
      errors: entry.errors + day.errors,
    });
  }
  return {
    onlinePercent: observed === 0 ? null : (online / observed) * 100,
    restarts: inside.reduce((sum, day) => sum + day.restarts, 0),
    jams: inside.reduce((sum, day) => sum + day.jams, 0),
    errors: inside.reduce((sum, day) => sum + day.errors, 0),
    months: [...months]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([month, value]) => ({ month, ...value })),
  };
}

export function printerPeriods(request: PeriodsRequest): PrinterStats {
  const map = new Map(request.days.map((day) => [day.day, day]));
  const window = windowOf(request.period, request.anchor);
  const before = previousWindowOf(request.period, request.anchor);
  const span = { period: request.period, window, today: request.today };
  const buckets = bucketsOf(map, request.period, window, request.firstDay);
  const totals = totalsOf(map, window, request.firstDay);
  const previous = totalsOf(map, before, request.firstDay);
  return {
    period: request.period,
    from: window.from,
    to: window.to,
    buckets,
    previousBuckets: bucketsOf(map, request.period, before, request.firstDay),
    totals,
    previous,
    delta: deltaOf(totals, previous),
    average7: averagesOf(map, span, buckets, PRINTER_AVERAGE_SHORT),
    average30: averagesOf(map, span, buckets, PRINTER_AVERAGE_LONG),
    busiestDay: busiestOf(request.days),
    pagesPerJob: pagesPerJobOf(request.jobPages),
    printFree: streakOf(map, 'free', request),
    printing: streakOf(map, 'printed', request),
    heatmap: heatmapOf(map, request.today, request.firstDay),
    weekdayHour: weekdayHourOf(map, request.today),
    reliability: reliabilityOf(request.days, window),
    lifetimePages: request.lifetimePages,
  };
}
