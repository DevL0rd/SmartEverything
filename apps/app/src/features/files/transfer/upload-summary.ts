import { bytes, count, percent } from '../../../format/number';
import { plural } from '../../../format/text';
import { duration } from '../../../format/time';
import type { ConflictRule } from '../source/types';
import type { UploadItem, UploadState } from './upload-queue';

export interface UploadSummary {
  readonly total: number;
  readonly finished: number;
  readonly landed: number;
  readonly failed: number;
  readonly sending: number;
  readonly waiting: number;
  readonly paused: number;
  readonly conflicts: number;
  readonly sent: number;
  readonly size: number;
}

export interface RateClock {
  readonly startAt: number;
  readonly startSent: number;
  readonly rate: number | null;
}

export function itemsIn(items: readonly UploadItem[], folderKey: string): readonly UploadItem[] {
  return items.filter((item) => item.folderKey === folderKey);
}

function tally(items: readonly UploadItem[], states: readonly UploadState[]): number {
  return items.filter((item) => states.includes(item.state)).length;
}

export function summaryOf(items: readonly UploadItem[]): UploadSummary {
  const counted = items.filter((item) => item.state !== 'cancelled' && item.state !== 'skipped');
  return {
    total: counted.length,
    finished: tally(counted, ['done', 'have', 'failed']),
    landed: tally(counted, ['done', 'have']),
    failed: tally(counted, ['failed']),
    sending: tally(counted, ['sending']),
    waiting: tally(counted, ['waiting']),
    paused: tally(counted, ['paused']),
    conflicts: tally(counted, ['conflict']),
    sent: counted.reduce((sum, item) => sum + Math.min(item.sent, item.size), 0),
    size: counted.reduce((sum, item) => sum + item.size, 0),
  };
}

export function isActive(summary: UploadSummary): boolean {
  return summary.sending + summary.waiting + summary.paused + summary.conflicts > 0;
}

export function headlineOf(summary: UploadSummary, folder: string): string {
  const { total, finished, landed, failed } = summary;
  if (summary.sending + summary.waiting > 0) {
    return `Uploading ${count(Math.min(finished + 1, total))} of ${count(total)} to ${folder}`;
  }
  if (summary.conflicts > 0) return `${plural(summary.conflicts, 'name')} already in ${folder}`;
  if (summary.paused > 0) return `Paused · ${count(finished)} of ${count(total)} sent`;
  if (failed === 0) return `Uploaded ${plural(total, 'file')} to ${folder}`;
  if (landed === 0) return `${plural(failed, 'upload')} failed`;
  return `Uploaded ${count(landed)} of ${count(total)} · ${count(failed)} failed`;
}

export function amountOf(summary: UploadSummary): string {
  return `${bytes(summary.sent)} of ${bytes(summary.size)}`;
}

export function rateText(bytesPerSecond: number): string {
  return `${bytes(bytesPerSecond)}/s`;
}

export function leftText(summary: UploadSummary, bytesPerSecond: number | null): string | null {
  if (bytesPerSecond === null || bytesPerSecond <= 0 || summary.sending === 0) return null;
  const seconds = (summary.size - summary.sent) / bytesPerSecond;
  if (seconds < 60) return 'Less than a minute left';
  return `${duration(Math.ceil(seconds / 60) * 60)} left`;
}

export function overallProgress(summary: UploadSummary): number {
  return summary.size === 0 ? 0 : Math.min(1, summary.sent / summary.size);
}

export function nextClock(
  clock: RateClock | undefined,
  sending: boolean,
  sent: number,
  at: number,
): RateClock | undefined {
  if (!sending) return undefined;
  if (clock === undefined) return { startAt: at, startSent: sent, rate: null };
  const seconds = (at - clock.startAt) / 1000;
  const moved = sent - clock.startSent;
  return { ...clock, rate: seconds > 0 && moved > 0 ? moved / seconds : clock.rate };
}

export function progressOf(item: UploadItem): number {
  return item.size === 0 ? 0 : Math.min(1, item.sent / item.size);
}

export function failureLineOf(item: UploadItem): string | null {
  if (item.state !== 'failed') return null;
  return item.retryable ? `Failed at ${percent(progressOf(item))}` : item.error;
}

export function sharedFailureOf(items: readonly UploadItem[]): string | null {
  const lines = items.flatMap((item) => {
    const line = item.state === 'failed' && !item.retryable ? item.error : null;
    return line === null ? [] : [line];
  });
  const first = lines[0];
  if (first === undefined || lines.length < 2) return null;
  return lines.every((line) => line === first) ? first : null;
}

export interface RetryNotice {
  readonly title: string;
  readonly body: string;
}

export function retryNoticeOf(items: readonly UploadItem[]): RetryNotice | null {
  const waiting = items.filter((item) => item.state === 'failed' && item.retryable);
  if (waiting.length === 0) return null;
  return {
    title: `${plural(waiting.length, 'upload')} failed`,
    body: 'The connection dropped. Try them again when it’s back.',
  };
}

export function storedAsText(name: string): string {
  return `Named ${name}`;
}

export function dropTitle(place: string): string {
  return `Drop to upload into ${place}`;
}

const CONFLICT_LINE: Readonly<Record<ConflictRule, string>> = {
  number: 'Names that already exist get a number, nothing is replaced',
  ask: 'You choose what happens to names that already exist',
};

export function dropDetail(rule: ConflictRule): string {
  return CONFLICT_LINE[rule];
}

export function blockedDropText(online: boolean, writable: boolean): string | null {
  if (!online) return 'Uploads wait until the connection is back. Drop again then.';
  return writable ? null : 'You can only view this folder, so files can’t be added here.';
}
