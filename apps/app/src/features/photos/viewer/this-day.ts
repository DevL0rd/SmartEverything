import type { TimelineBucket } from '@smarteverything/domain';

export function sameDayIn(year: number, monthDay: string): string | null {
  const day = `${String(year).padStart(4, '0')}-${monthDay}`;
  const at = new Date(`${day}T12:00:00Z`);
  return Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== day ? null : day;
}

export function otherYearDays(buckets: readonly TimelineBucket[], day: string): readonly string[] {
  const monthDay = day.slice(5);
  const month = day.slice(5, 7);
  const year = day.slice(0, 4);
  return buckets
    .filter((bucket) => bucket.month.slice(5) === month && bucket.month.slice(0, 4) !== year)
    .map((bucket) => sameDayIn(Number(bucket.month.slice(0, 4)), monthDay))
    .filter((other) => other !== null);
}
