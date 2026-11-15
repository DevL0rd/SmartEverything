import type { LibraryBucket } from '@smarteverything/domain';
import { count } from '../../../format/number';

export interface YearCount {
  readonly year: string;
  readonly count: number;
}

export function yearsOf(buckets: readonly LibraryBucket[]): readonly YearCount[] {
  const years = new Map<number, number>();
  for (const bucket of buckets) {
    const year = Number(bucket.month.slice(0, 4));
    years.set(year, (years.get(year) ?? 0) + bucket.count);
  }
  const known = [...years.keys()];
  if (known.length === 0) return [];
  const first = Math.min(...known);
  const last = Math.max(...known);
  return Array.from({ length: last - first + 1 }, (_, index) => ({
    year: String(first + index),
    count: years.get(first + index) ?? 0,
  }));
}

export function shareOf(value: number, years: readonly YearCount[]): number {
  const peak = years.reduce((most, year) => Math.max(most, year.count), 0);
  return peak === 0 ? 0 : value / peak;
}

export function archiveSubtitle(total: number | null): string | null {
  if (total === null) return null;
  if (total === 0) return 'Hidden from the Library and Map';
  return `${total === 1 ? '1 item' : `${count(total)} items`} hidden from the Library and Map`;
}

export function spanText(years: readonly YearCount[]): string | null {
  const first = years[0];
  const last = years.at(-1);
  if (first === undefined || last === undefined) return null;
  return first.year === last.year ? `From ${first.year}` : `From ${first.year} to ${last.year}`;
}
