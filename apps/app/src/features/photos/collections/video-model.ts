import type { DriveDurationBucket, LibraryBucket, PhotoInsights } from '@smarteverything/domain';
import type { Bar } from '../../../components/charts';
import type { DayText } from '../../../components/media-grid/day-text';
import { monthTitle } from '../../../components/media-grid/scrubber-model';
import type { MediaDay } from '../../../components/media-grid/tiles';
import { bytes, count, decimal } from '../../../format/number';
import { DAY_MS, MINUTE_MS, playTime } from '../../../format/time';
import { monthInitial, monthName } from '../model/media-text';

export interface VideoStats {
  readonly videos: string;
  readonly size: string;
  readonly totalTime: string;
  readonly watching: string | null;
  readonly longest: string | null;
}

export interface DurationChip {
  readonly bucket: DriveDurationBucket | null;
  readonly label: string;
  readonly count: number;
}

export type HoursAdded = NonNullable<PhotoInsights['hoursAddedPerMonth']>;

const BUCKET_LABELS: Readonly<Record<DriveDurationBucket, string>> = {
  under_1m: 'Under 1 min',
  '1_to_10m': '1 to 10 min',
  '10_to_60m': '10 to 60 min',
  over_60m: 'Over an hour',
};

const MINUTES_PER_HOUR = 60;

export function watchingText(durationMs: number): string | null {
  if (durationMs < DAY_MS) return null;
  return `about ${decimal(durationMs / DAY_MS, 1)} days of watching`;
}

export function lengthText(durationMs: number): string {
  if (durationMs < MINUTE_MS) return `${String(Math.round(durationMs / 1000))} s`;
  const minutes = Math.round(durationMs / MINUTE_MS);
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const rest = minutes % MINUTES_PER_HOUR;
  if (hours === 0) return `${String(rest)} min`;
  return rest === 0 ? `${count(hours)} h` : `${count(hours)} h ${String(rest)} min`;
}

export function videoStatsOf(insights: PhotoInsights): VideoStats {
  const totals = insights.videoTotals;
  return {
    videos: count(totals.items),
    size: bytes(totals.bytes),
    totalTime: lengthText(totals.durationMs),
    watching: watchingText(totals.durationMs),
    longest: totals.longestMs === null ? null : playTime(totals.longestMs / 1000),
  };
}

function videoCount(total: number): string {
  return total === 1 ? '1 video' : `${count(total)} videos`;
}

export function videoMonthText(group: MediaDay, total: number | null): DayText {
  const title = monthTitle(group.key);
  if (total === null) return { title, detail: '' };
  if (group.tiles.length < total) return { title, detail: videoCount(total) };
  const length = group.tiles.reduce((sum, tile) => sum + (tile.durationMs ?? 0), 0);
  return { title, detail: `${videoCount(total)} · ${lengthText(length)}` };
}

export function videoLineOf(insights: PhotoInsights | undefined): string | null {
  if (insights === undefined) return null;
  const totals = insights.videoTotals;
  if (totals.items === 0) return null;
  return [videoCount(totals.items), lengthText(totals.durationMs), bytes(totals.bytes)].join(' · ');
}

export function durationChipsOf(insights: PhotoInsights): readonly DurationChip[] {
  const buckets = insights.durationBuckets
    .filter((bucket) => bucket.items > 0)
    .map((bucket): DurationChip => ({
      bucket: bucket.bucket,
      label: BUCKET_LABELS[bucket.bucket],
      count: bucket.items,
    }));
  return [{ bucket: null, label: 'Any length', count: insights.videoTotals.items }, ...buckets];
}

export function hoursBarsOf(hours: HoursAdded): readonly Bar[] {
  return hours.map((month) => ({
    key: month.month,
    value: month.hours,
    label: monthInitial(month.month),
  }));
}

export function peakHoursOf(hours: HoursAdded): HoursAdded[number] | null {
  return hours.reduce<HoursAdded[number] | null>(
    (peak, month) =>
      month.hours > 0 && (peak === null || month.hours > peak.hours) ? month : peak,
    null,
  );
}

export function hoursText(hours: number): string {
  return `${decimal(hours, hours < 10 ? 1 : 0)} h`;
}

export function peakHoursText(hours: HoursAdded): string | null {
  const peak = peakHoursOf(hours);
  return peak === null ? null : `Peak ${monthName(peak.month)}, ${hoursText(peak.hours)}`;
}

export function hoursLabelOf(hours: HoursAdded): string {
  const peak = peakHoursOf(hours);
  const base = 'Hours of video added per month over the last 12 months';
  return peak === null ? base : `${base}, ${monthName(peak.month)} is the peak`;
}

export type MonthTotal = (month: string) => number | null;

export function bucketMonthTotal(buckets: readonly LibraryBucket[]): MonthTotal {
  const counts = new Map(buckets.map((bucket) => [bucket.month, bucket.count] as const));
  return (month) => counts.get(month) ?? null;
}
