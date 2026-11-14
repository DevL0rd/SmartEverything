import type { DriveStats, MediaProcessing, PhotoInsights } from '@smarteverything/domain';
import type { Bar, BarSegment } from '../../../components/charts';
import type { ConfirmRequest } from '../../../components/confirm-store';
import { bytes, count } from '../../../format/number';
import { DAY_MS, shortDate, startOfDayKey } from '../../../format/time';
import { librarySegmentsOf } from '../components/photos-frame';
import type { Freeable } from './runner/free-up';
import type { ProcessingKind, Progress } from './phones-model';

const DAYS_PER_MONTH = 365.25 / 12;

type GrowthDays = NonNullable<DriveStats['growth']>;

export interface AddedMonth {
  readonly bars: readonly Bar[];
  readonly items: number;
  readonly from: string;
  readonly to: string;
}

export function addedInMonth(growth: GrowthDays | null, month: string): AddedMonth | null {
  if (growth === null) return null;
  const days = growth.filter((day) => day.day.startsWith(month));
  const first = days[0];
  const last = days.at(-1);
  if (first === undefined || last === undefined) return null;
  return {
    bars: days.map((day) => ({
      key: day.day,
      value: day.added,
      label: `${shortDate(startOfDayKey(day.day))}: ${count(day.added)} added`,
    })),
    items: days.reduce((sum, day) => sum + day.added, 0),
    from: shortDate(startOfDayKey(first.day)),
    to: shortDate(startOfDayKey(last.day)),
  };
}

export interface StorageView {
  readonly libraryBytes: number;
  readonly segments: readonly BarSegment[];
  readonly totalBytes: number;
  readonly freeBytes: number;
}

export function storageOf(
  stats: Pick<DriveStats, 'space'>,
  insights: Pick<PhotoInsights, 'kinds'>,
): StorageView {
  const library = librarySegmentsOf(insights.kinds).filter((segment) => segment.value > 0);
  const libraryBytes = library.reduce((sum, segment) => sum + segment.value, 0);
  const { totalBytes, freeBytes } = stats.space;
  const other = Math.max(0, totalBytes - freeBytes - libraryBytes);
  return {
    libraryBytes,
    segments: [
      ...library,
      { label: 'Other files on the disk', value: other, colour: 'on-surface-faint' },
    ],
    totalBytes,
    freeBytes,
  };
}

export function monthlyGrowthOf(growth: GrowthDays | null): number | null {
  const first = growth?.[0];
  const last = growth?.at(-1);
  if (first === undefined || last === undefined) return null;
  const days = (startOfDayKey(last.day) - startOfDayKey(first.day)) / DAY_MS;
  if (days <= 0) return null;
  return ((last.bytes - first.bytes) / days) * DAYS_PER_MONTH;
}

export function fullYearOf(stats: Pick<DriveStats, 'fullInMonths'>, now: number): number | null {
  const months = stats.fullInMonths;
  if (months === null) return null;
  return new Date(now + months * DAYS_PER_MONTH * DAY_MS).getFullYear();
}

export function growthTextOf(stats: DriveStats, now: number): string | null {
  const perMonth = monthlyGrowthOf(stats.growth);
  if (perMonth === null) return null;
  const pace = perMonth <= 0 ? 'The library is not growing.' : `About ${bytes(perMonth)} a month.`;
  const year = fullYearOf(stats, now);
  return year === null || perMonth <= 0
    ? pace
    : `${pace} At this pace the disk is full in ${String(year)}.`;
}

const KIND_LABEL: Readonly<Record<ProcessingKind, string>> = {
  preview: 'Previews',
  poster: 'Video posters',
  playable: 'Video copies',
};

const KIND_ORDER: readonly ProcessingKind[] = ['preview', 'poster', 'playable'];

export interface ProcessingRow {
  readonly key: ProcessingKind;
  readonly label: string;
  readonly progress: number;
  readonly note: string;
  readonly done: boolean;
}

export interface ProcessingView {
  readonly left: number;
  readonly rows: readonly ProcessingRow[];
  readonly failedItems: readonly string[];
}

function rowOf(kind: ProcessingKind, progress: Progress): ProcessingRow {
  const left = progress.total - progress.done;
  return {
    key: kind,
    label: KIND_LABEL[kind],
    progress: progress.total === 0 ? 1 : progress.done / progress.total,
    note: left === 0 ? 'done' : `${count(left)} left`,
    done: left === 0,
  };
}

export function processingOf(
  processing: MediaProcessing,
  kinds: ReadonlyMap<ProcessingKind, Progress>,
): ProcessingView {
  return {
    left: processing.queued + processing.running,
    rows: KIND_ORDER.flatMap((kind) => {
      const progress = kinds.get(kind);
      return progress === undefined ? [] : [rowOf(kind, progress)];
    }),
    failedItems: [...new Set(processing.failed.map((job) => job.itemId))],
  };
}

export function jobsLeftText(left: number): string {
  if (left === 0) return 'Nothing waiting';
  return `${count(left)} ${left === 1 ? 'job' : 'jobs'} left · visible items first`;
}

export function unreadableText(files: number): string {
  return files === 1
    ? '1 file could not be read. The original stays and can be downloaded.'
    : `${count(files)} files could not be read. The originals stay and can be downloaded.`;
}

export function freeUpLabelOf(freeable: Freeable): string {
  return `Free up ${bytes(freeable.bytes)}`;
}

function itemsText(freeable: Freeable): string {
  const items = freeable.localIds.length;
  return items === 1 ? '1 photo or video' : `${count(items)} photos and videos`;
}

export function freeUpBodyOf(freeable: Freeable): string {
  return `Removes ${itemsText(freeable)} from this phone that the hub already has and has checked. They stay in Photos.`;
}

export function freeUpConfirmOf(freeable: Freeable): ConfirmRequest {
  return {
    title: `${freeUpLabelOf(freeable)} on this phone?`,
    body: `Removes ${itemsText(freeable)} from this phone. The hub already has each one and has checked it, so they stay in Photos and you can download them again.`,
    confirmLabel: freeUpLabelOf(freeable),
    cancelLabel: 'Keep them',
  };
}
