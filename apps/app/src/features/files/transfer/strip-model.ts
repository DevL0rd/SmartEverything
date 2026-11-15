import type { UploadItem } from './upload-queue';
import { isActive, type UploadSummary } from './upload-summary';

export type StripHeadAction = 'pause' | 'resume' | 'close' | null;

export function headActionOf(summary: UploadSummary, resume: boolean): StripHeadAction {
  if (!isActive(summary)) return 'close';
  if (!resume) return null;
  return summary.paused > 0 && summary.sending + summary.waiting === 0 ? 'resume' : 'pause';
}

export type UploadRowEnd =
  | { readonly kind: 'controls'; readonly pausable: boolean }
  | { readonly kind: 'done'; readonly storedAs: string | null }
  | { readonly kind: 'have' }
  | { readonly kind: 'failed'; readonly retryable: boolean }
  | { readonly kind: 'none' };

export function rowEndOf(item: UploadItem, resume: boolean): UploadRowEnd {
  switch (item.state) {
    case 'waiting':
    case 'conflict':
      return { kind: 'controls', pausable: false };
    case 'sending':
    case 'paused':
      return { kind: 'controls', pausable: resume };
    case 'done':
      return { kind: 'done', storedAs: item.storedAs };
    case 'have':
      return { kind: 'have' };
    case 'failed':
      return { kind: 'failed', retryable: item.retryable };
    case 'skipped':
    case 'cancelled':
      return { kind: 'none' };
  }
}

export function retryBodyOf(resume: boolean): string {
  return resume
    ? 'The connection dropped. They pick up where they stopped when you try again.'
    : 'The connection dropped. They start again from the beginning when you try again.';
}

export function shownRowsOf(items: readonly UploadItem[]): readonly UploadItem[] {
  return items.filter((item) => item.state !== 'cancelled');
}
