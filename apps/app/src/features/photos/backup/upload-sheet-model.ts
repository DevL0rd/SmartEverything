import type { UploadEntry } from '../../drive';
import { entryStatus } from '../library/upload-model';

export const ALREADY_THERE_PHONE = 'Already there';

export type SheetEntryText =
  | { readonly kind: 'progress'; readonly share: number }
  | { readonly kind: 'note'; readonly text: string; readonly critical: boolean };

export function sheetEntryText(entry: UploadEntry): SheetEntryText {
  if (entry.outcome?.kind === 'already-have') {
    return { kind: 'note', text: ALREADY_THERE_PHONE, critical: false };
  }
  const status = entryStatus(entry);
  if (status.kind === 'progress') {
    return status.paused
      ? { kind: 'note', text: 'Paused', critical: false }
      : { kind: 'progress', share: status.share };
  }
  if (status.kind === 'done')
    return { kind: 'note', text: status.text ?? 'Uploaded', critical: false };
  return { kind: 'note', text: status.text, critical: status.critical };
}

export function sheetTargetText(path: string | null, person: string | null): string {
  if (path !== null) return `Goes to ${path} in the library folder`;
  return person === null
    ? 'Goes to your Uploads folder in the library folder'
    : `Goes to Uploads/${person} in the library folder`;
}
