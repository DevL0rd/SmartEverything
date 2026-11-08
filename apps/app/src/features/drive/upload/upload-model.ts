import { bytes, count, percent } from '../../../format/number';
import { plural } from '../../../format/text';
import { duration } from '../../../format/time';
import type { UploadEntries, UploadEntry, UploadFailure } from '../../nas/uploads';

export interface UploadRecord {
  readonly key: string;
  readonly folderId: string;
  readonly name: string;
  readonly size: number;
  readonly handleId: string | null;
}

export type UploadRowState =
  | { readonly kind: 'waiting' }
  | { readonly kind: 'sending'; readonly progress: number }
  | { readonly kind: 'paused'; readonly progress: number }
  | { readonly kind: 'done'; readonly storedAs: string | null }
  | { readonly kind: 'have' }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'failed'; readonly text: string; readonly retryable: boolean };

export interface UploadRow {
  readonly key: string;
  readonly name: string;
  readonly size: number;
  readonly sent: number;
  readonly state: UploadRowState;
}

export interface UploadSummary {
  readonly total: number;
  readonly finished: number;
  readonly landed: number;
  readonly failed: number;
  readonly sending: number;
  readonly waiting: number;
  readonly paused: number;
  readonly sent: number;
  readonly size: number;
}

export interface RateClock {
  readonly startAt: number;
  readonly startSent: number;
  readonly rate: number | null;
}

const FAILURE_TEXT: Readonly<Record<Exclude<UploadFailure['kind'], 'rejected'>, string>> = {
  'over-quota': 'Your Drive space is full. Free some space or ask the owner for more.',
  'no-space': 'The hub’s disk is full. Nothing was saved.',
  'read-only-root': 'This folder is read-only, so files can’t be added here.',
  'session-refused': 'The hub didn’t accept this device. Sign in again, then try again.',
  'session-expired': 'This upload waited too long and expired. Try again to send it.',
  'hub-unreachable': 'The hub couldn’t be reached. It starts again when the hub is back.',
  'client-error': 'This file couldn’t be read on this device.',
};

const RETRYABLE: ReadonlySet<UploadFailure['kind']> = new Set([
  'hub-unreachable',
  'session-expired',
]);

export function failureText(failure: UploadFailure): string {
  return failure.kind === 'rejected' ? failure.message : FAILURE_TEXT[failure.kind];
}

export function isRetryable(failure: UploadFailure): boolean {
  return RETRYABLE.has(failure.kind);
}

function progressOf(entry: UploadEntry): number {
  return entry.size === 0 ? 0 : Math.min(1, entry.sent / entry.size);
}

function settledState(entry: UploadEntry): UploadRowState {
  const { outcome } = entry;
  if (outcome === null) {
    return { kind: 'failed', text: 'This upload stopped without an answer.', retryable: true };
  }
  switch (outcome.kind) {
    case 'done':
      return { kind: 'done', storedAs: outcome.renamed ? outcome.name : null };
    case 'already-have':
      return { kind: 'have' };
    case 'cancelled':
      return { kind: 'cancelled' };
    case 'failed':
      return {
        kind: 'failed',
        text: failureText(outcome.failure),
        retryable: isRetryable(outcome.failure),
      };
  }
}

export function stateOf(entry: UploadEntry): UploadRowState {
  if (entry.state === 'uploading') return { kind: 'sending', progress: progressOf(entry) };
  if (entry.state === 'paused') return { kind: 'paused', progress: progressOf(entry) };
  return settledState(entry);
}

function rowOf(record: UploadRecord, byId: ReadonlyMap<string, UploadEntry>): UploadRow | null {
  const base = { key: record.key, name: record.name, size: record.size };
  if (record.handleId === null) return { ...base, sent: 0, state: { kind: 'waiting' } };
  const entry = byId.get(record.handleId);
  return entry === undefined ? null : { ...base, sent: entry.sent, state: stateOf(entry) };
}

export function rowsOf(
  records: readonly UploadRecord[],
  entries: UploadEntries,
  folderId: string,
): readonly UploadRow[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return records
    .filter((record) => record.folderId === folderId)
    .map((record) => rowOf(record, byId))
    .filter((row) => row !== null);
}

function tally(rows: readonly UploadRow[], kinds: readonly UploadRowState['kind'][]): number {
  return rows.filter((row) => kinds.includes(row.state.kind)).length;
}

export function summaryOf(rows: readonly UploadRow[]): UploadSummary {
  const counted = rows.filter((row) => row.state.kind !== 'cancelled');
  return {
    total: counted.length,
    finished: tally(counted, ['done', 'have', 'failed']),
    landed: tally(counted, ['done', 'have']),
    failed: tally(counted, ['failed']),
    sending: tally(counted, ['sending']),
    waiting: tally(counted, ['waiting']),
    paused: tally(counted, ['paused']),
    sent: counted.reduce((sum, row) => sum + Math.min(row.sent, row.size), 0),
    size: counted.reduce((sum, row) => sum + row.size, 0),
  };
}

export function isActive(summary: UploadSummary): boolean {
  return summary.sending + summary.waiting + summary.paused > 0;
}

export function headlineOf(summary: UploadSummary, folder: string): string {
  const { total, finished, landed, failed } = summary;
  if (summary.sending + summary.waiting > 0) {
    return `Uploading ${count(Math.min(finished + 1, total))} of ${count(total)} to ${folder}`;
  }
  if (summary.paused > 0) return `Paused · ${count(finished)} of ${count(total)} sent`;
  if (failed === 0) return `Uploaded ${plural(total, 'file')} to ${folder}`;
  return `Uploaded ${count(landed)} of ${count(total)} · ${count(failed)} didn’t upload`;
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

export function failedAtText(row: UploadRow): string {
  return `Failed at ${percent(row.size === 0 ? 0 : Math.min(1, row.sent / row.size))}`;
}

export function failureLineOf(row: UploadRow): string | null {
  const { state } = row;
  if (state.kind !== 'failed') return null;
  return state.retryable ? failedAtText(row) : state.text;
}

export interface RetryNotice {
  readonly title: string;
  readonly body: string;
}

export function retryNoticeOf(rows: readonly UploadRow[]): RetryNotice | null {
  const waiting = rows.filter((row) => row.state.kind === 'failed' && row.state.retryable);
  if (waiting.length === 0) return null;
  return {
    title: `${plural(waiting.length, 'upload')} failed`,
    body: 'The hub stopped answering. They start again when it’s back.',
  };
}

export function identityOf(name: string, folderId: string, modifiedAt: number | null): string {
  return ['drive-upload', folderId, name, modifiedAt === null ? '' : String(modifiedAt)].join(':');
}

export function storedAsText(name: string): string {
  return `Named ${name}`;
}

export function dropTitle(folder: string): string {
  return `Drop to upload into ${folder}`;
}

const CLASH_RULE = 'Names that already exist get a number, nothing is replaced';

export function dropDetail(computers: number): string {
  return computers === 0
    ? CLASH_RULE
    : `${CLASH_RULE} · Synced to ${plural(computers, 'computer')} after upload`;
}

export function blockedDropText(online: boolean): string {
  return online
    ? 'This library folder is read-only, so files can’t be added here.'
    : 'Uploads wait until the hub is back. Drop again then.';
}
