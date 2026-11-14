import { ValueStore, usePausable } from '../../../../design/external-store';
import type { UploadOutcome } from './types';

export interface UploadEntry {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly sent: number;
  readonly state: 'uploading' | 'paused' | 'settled';
  readonly outcome: UploadOutcome | null;
}

export type UploadEntries = readonly UploadEntry[];

export const uploadEntries = new ValueStore<UploadEntries>([]);

export function addUploadEntry(entry: UploadEntry): void {
  uploadEntries.update((current) => [...current, entry]);
}

export function patchUploadEntry(id: string, patch: Partial<Omit<UploadEntry, 'id'>>): void {
  uploadEntries.update((current) =>
    current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
  );
}

export function dismissUpload(id: string): void {
  uploadEntries.update((current) => current.filter((entry) => entry.id !== id));
}

export function useUploadEntries(): UploadEntries {
  return usePausable(uploadEntries.subscribe, uploadEntries.get);
}

export function totalProgress(entries: UploadEntries): { sent: number; size: number } {
  return entries
    .filter((entry) => entry.state !== 'settled')
    .reduce((sum, entry) => ({ sent: sum.sent + entry.sent, size: sum.size + entry.size }), {
      sent: 0,
      size: 0,
    });
}
