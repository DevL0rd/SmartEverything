import { bytes, count } from '../../../format/number';
import type { UploadEntries, UploadEntry, UploadFailure } from '../../drive';

export const ALREADY_THERE = 'Already in library';
export const RENAMED = 'Renamed, name taken';
export const RESUME_NOTE = 'resumes if the app closes';

export type EntryStatus =
  | { readonly kind: 'progress'; readonly share: number; readonly paused: boolean }
  | { readonly kind: 'done'; readonly text: string | null }
  | { readonly kind: 'note'; readonly text: string; readonly critical: boolean };

const FAILURE_TEXT: Readonly<Record<UploadFailure['kind'], string>> = {
  'over-quota': 'Over your storage share',
  'no-space': 'The hub is out of space',
  'read-only-root': 'The library folder is read-only',
  'session-refused': 'The hub refused the upload',
  'session-expired': 'The upload expired, start it again',
  'hub-unreachable': 'Waiting for the hub',
  rejected: 'The hub refused this file',
  'client-error': 'Could not read this file',
};

export function shareOf(entry: UploadEntry): number {
  return entry.size === 0 ? 0 : Math.min(1, entry.sent / entry.size);
}

export function entryStatus(entry: UploadEntry): EntryStatus {
  const outcome = entry.outcome;
  if (outcome === null) {
    return { kind: 'progress', share: shareOf(entry), paused: entry.state === 'paused' };
  }
  if (outcome.kind === 'already-have') {
    return { kind: 'note', text: ALREADY_THERE, critical: false };
  }
  if (outcome.kind === 'done') return { kind: 'done', text: outcome.renamed ? RENAMED : null };
  if (outcome.kind === 'cancelled') return { kind: 'note', text: 'Cancelled', critical: false };
  return { kind: 'note', text: FAILURE_TEXT[outcome.failure.kind], critical: true };
}

export function percentText(share: number): string {
  return `${String(Math.round(share * 100))} %`;
}

export interface PanelSummary {
  readonly title: string;
  readonly detail: string | null;
  readonly running: boolean;
  readonly paused: boolean;
}

function leftOf(entries: UploadEntries): number {
  return entries
    .filter((entry) => entry.state !== 'settled')
    .reduce((sum, entry) => sum + Math.max(0, entry.size - entry.sent), 0);
}

export function panelSummary(entries: UploadEntries): PanelSummary {
  const settled = entries.filter((entry) => entry.state === 'settled').length;
  const open = entries.filter((entry) => entry.state !== 'settled');
  const paused = open.length > 0 && open.every((entry) => entry.state === 'paused');
  if (open.length === 0) {
    const failed = entries.filter((entry) => entry.outcome?.kind === 'failed').length;
    return {
      title: failed === 0 ? `Uploaded ${count(settled)}` : `${count(failed)} did not upload`,
      detail: null,
      running: false,
      paused: false,
    };
  }
  return {
    title: `${paused ? 'Paused' : 'Uploading'} ${count(settled)} of ${count(entries.length)}`,
    detail: `${bytes(leftOf(entries))} left · ${RESUME_NOTE}`,
    running: true,
    paused,
  };
}

export function destinationText(path: string | null): string {
  return path === null
    ? 'Goes to your Uploads folder in the library folder.'
    : `Goes to ${path} in the library folder.`;
}

export function dropText(path: string | null): string {
  const where = path ?? 'your Uploads folder';
  return `They go to ${where}. Files the library already has are skipped.`;
}
