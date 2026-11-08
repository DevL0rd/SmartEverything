import {
  DRIVE_DURATION_BUCKETS,
  PHOTO_INSIGHT_KINDS,
  PHOTO_SEASONS,
  driveDurationBucket,
  driveHistoryShown,
  type GeoPoint,
  type PhotoInsightKind,
  type PhotoInsightRange,
  type PhotoInsights,
} from '@smarteverything/domain';
import { z } from 'zod';

export const RANKING_LENGTH = 10;

const MONTHS_IN_YEAR = 12;

const WEEKDAYS = 7;

const HOURS = 24;

const COUNT_FIELD = z.number().int().nonnegative();

export const MONTH_KIND_ROW = z.strictObject({
  month: z.string(),
  kind: z.enum(PHOTO_INSIGHT_KINDS),
  items: COUNT_FIELD,
  bytes: COUNT_FIELD,
});

export const DAY_ROW = z.strictObject({ day: z.string(), items: COUNT_FIELD });

export const CLOCK_ROW = z.strictObject({
  month: z.coerce.number().int(),
  weekday: z.coerce.number().int(),
  hour: z.coerce.number().int(),
  items: COUNT_FIELD,
});

export const CAMERA_ROW = z.strictObject({
  make: z.string().nullable(),
  model: z.string().nullable(),
  items: COUNT_FIELD,
});

export const LENS_ROW = z.strictObject({ name: z.string(), items: COUNT_FIELD });

export const ROOT_ROW = z.strictObject({
  root_id: z.string(),
  photos: COUNT_FIELD,
  videos: COUNT_FIELD,
  photo_bytes: COUNT_FIELD,
  video_bytes: COUNT_FIELD,
});

export const LARGEST_ROW = z.strictObject({
  id: z.string(),
  bytes: COUNT_FIELD,
  duration_ms: COUNT_FIELD.nullable(),
});

export const DURATION_ROW = z.strictObject({
  duration_ms: COUNT_FIELD,
  items: COUNT_FIELD,
  bytes: COUNT_FIELD,
});

export const HOURS_ROW = z.strictObject({ month: z.string(), duration_ms: COUNT_FIELD });

export const COUNTRY_ROW = z.strictObject({
  code: z.string().length(2),
  items: COUNT_FIELD,
  places: COUNT_FIELD,
});

export const COVERAGE_ROW = z.strictObject({
  id: z.string(),
  name: z.string(),
  total: COUNT_FIELD,
  backed_up: COUNT_FIELD,
});

export interface InsightsContext {
  readonly today: string;
  readonly home: GeoPoint | null;
}

export interface Totals {
  items: number;
  bytes: number;
}

export function monthIndex(month: string): number {
  return Number(month.slice(0, 4)) * MONTHS_IN_YEAR + Number(month.slice(5, 7)) - 1;
}

export function monthOf(index: number): string {
  const year = Math.floor(index / MONTHS_IN_YEAR);
  return `${String(year).padStart(4, '0')}-${String((index % MONTHS_IN_YEAR) + 1).padStart(2, '0')}`;
}

export function monthsBetween(first: string, last: string): string[] {
  const months: string[] = [];
  for (let index = monthIndex(first); index <= monthIndex(last); index += 1) {
    months.push(monthOf(index));
  }
  return months;
}

export function twelveMonthsFrom(today: string): string {
  return `${monthOf(monthIndex(today.slice(0, 7)) - (MONTHS_IN_YEAR - 1))}-01`;
}

export function rangeFrom(range: PhotoInsightRange, today: string): string | null {
  if (range === 'this_year') {
    return `${today.slice(0, 4)}-01-01`;
  }
  return range === 'last_12_months' ? twelveMonthsFrom(today) : null;
}

const SEASON_BY_THIRD = ['winter', 'spring', 'summer', 'autumn'] as const;

export function seasonOf(month: number, home: GeoPoint | null): (typeof PHOTO_SEASONS)[number] {
  const local = home !== null && home.latitude < 0 ? ((month + 5) % MONTHS_IN_YEAR) + 1 : month;
  return SEASON_BY_THIRD[Math.floor((local % MONTHS_IN_YEAR) / 3)] ?? 'winter';
}

export function countryName(code: string): string {
  return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
}

export function growthOf(
  rows: readonly z.output<typeof MONTH_KIND_ROW>[],
  months: readonly string[],
): NonNullable<PhotoInsights['growth']> {
  const running = new Map<PhotoInsightKind, Totals>(
    PHOTO_INSIGHT_KINDS.map((kind) => [kind, { items: 0, bytes: 0 }]),
  );
  return months.flatMap((month) => {
    for (const row of rows.filter((one) => one.month === month)) {
      const total = running.get(row.kind);
      if (total !== undefined) {
        total.items += row.items;
        total.bytes += row.bytes;
      }
    }
    return PHOTO_INSIGHT_KINDS.map((kind) => ({
      month,
      kind,
      items: running.get(kind)?.items ?? 0,
      bytes: running.get(kind)?.bytes ?? 0,
    }));
  });
}

export function totalsOf(rows: readonly z.output<typeof MONTH_KIND_ROW>[]): PhotoInsights['kinds'] {
  return PHOTO_INSIGHT_KINDS.map((kind) => {
    const own = rows.filter((row) => row.kind === kind);
    return {
      kind,
      items: own.reduce((sum, row) => sum + row.items, 0),
      bytes: own.reduce((sum, row) => sum + row.bytes, 0),
    };
  });
}

export function weekdayByHour(
  rows: readonly z.output<typeof CLOCK_ROW>[],
): PhotoInsights['weekdayByHour'] {
  return Array.from({ length: WEEKDAYS * HOURS }, (_, cell) => {
    const weekday = Math.floor(cell / HOURS);
    const hour = cell % HOURS;
    const items = rows
      .filter((row) => (row.weekday + 6) % WEEKDAYS === weekday && row.hour === hour)
      .reduce((sum, row) => sum + row.items, 0);
    return { weekday, hour, items };
  });
}

export function seasonByHour(
  rows: readonly z.output<typeof CLOCK_ROW>[],
  home: GeoPoint | null,
): PhotoInsights['seasonByHour'] {
  return PHOTO_SEASONS.flatMap((season) =>
    Array.from({ length: HOURS }, (_, hour) => ({
      season,
      hour,
      items: rows
        .filter((row) => row.hour === hour && seasonOf(row.month, home) === season)
        .reduce((sum, row) => sum + row.items, 0),
    })),
  );
}

export function durationBucketsOf(
  rows: readonly z.output<typeof DURATION_ROW>[],
): PhotoInsights['durationBuckets'] {
  return DRIVE_DURATION_BUCKETS.map((bucket) => {
    const own = rows.filter((row) => driveDurationBucket(row.duration_ms) === bucket);
    return {
      bucket,
      items: own.reduce((sum, row) => sum + row.items, 0),
      bytes: own.reduce((sum, row) => sum + row.bytes, 0),
    };
  });
}

export function historyMonths(days: readonly z.output<typeof DAY_ROW>[]): string[] | null {
  const first = days[0]?.day;
  const latest = days.at(-1)?.day;
  return first !== undefined && latest !== undefined && driveHistoryShown(first, latest)
    ? monthsBetween(first.slice(0, 7), latest.slice(0, 7))
    : null;
}

export function busiestOf(days: readonly z.output<typeof DAY_ROW>[]): PhotoInsights['busiestDays'] {
  return days
    .toSorted((a, b) => b.items - a.items || a.day.localeCompare(b.day))
    .slice(0, RANKING_LENGTH);
}

export function videoTotalsOf(
  kinds: PhotoInsights['kinds'],
  durations: readonly z.output<typeof DURATION_ROW>[],
): PhotoInsights['videoTotals'] {
  const video = kinds.find((one) => one.kind === 'video');
  return {
    items: video?.items ?? 0,
    bytes: video?.bytes ?? 0,
    durationMs: durations.reduce((sum, row) => sum + row.duration_ms * row.items, 0),
    longestMs: durations.reduce<number | null>(
      (longest, row) => (longest === null || row.duration_ms > longest ? row.duration_ms : longest),
      null,
    ),
  };
}

export function placesOf(rows: readonly z.output<typeof COUNTRY_ROW>[]): PhotoInsights['places'] {
  return {
    places: rows.reduce((sum, row) => sum + row.places, 0),
    countries: rows.map((row) => ({
      countryCode: row.code,
      country: countryName(row.code),
      items: row.items,
    })),
  };
}
