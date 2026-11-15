import type { DriveChangeResult } from '@smarteverything/domain';
import type { ConfirmRequest } from '../../../components/confirm-store';
import { bytes, count } from '../../../format/number';
import { itemsText, totalsText, type TrashTotals } from './trash-model';

export const KEPT_NOTE = 'each item is kept a year, then deleted';

export const OWNER_NOTE =
  'Your drive’s trash is only yours. Shared Drive trash is seen by everyone in the home.';

export const MEMBER_NOTE =
  'Your drive’s trash is only yours. In the Shared Drive you delete for good only what you deleted.';

export function subtitleOf(totals: TrashTotals | null, short: boolean): string {
  const kept = short ? 'each kept a year' : KEPT_NOTE;
  return totals === null || totals.count === 0
    ? `Deleted files and folders · ${kept}`
    : `${totalsText(totals)} · ${kept}`;
}

export type DeleteScope = 'all' | 'shown';

export function deleteLabelOf(scope: DeleteScope, shown: number): string {
  return scope === 'all' ? 'Delete all now' : `Delete ${count(shown)} shown now`;
}

export function deleteConfirmOf(scope: DeleteScope, totals: TrashTotals): ConfirmRequest {
  if (scope === 'all') {
    return {
      title: `Delete all ${itemsText(totals.count)} now?`,
      body: `Everything in Trash leaves for good and can't be restored. This frees ${bytes(totals.bytes)}.`,
      confirmLabel: 'Delete all now',
      tone: 'destructive',
    };
  }
  return {
    title: `Delete the ${itemsText(totals.count)} shown now?`,
    body: `The items shown leave Trash for good and can't be restored. The rest stay in Trash. This frees ${bytes(totals.bytes)}.`,
    confirmLabel: deleteLabelOf('shown', totals.count),
    tone: 'destructive',
  };
}

export type TrashVerb = 'restored' | 'deleted';

export function skippedText(result: DriveChangeResult, verb: TrashVerb): string | null {
  const skipped = result.failed.length + result.conflicts.length;
  if (skipped === 0) return null;
  return skipped === 1 ? `1 item was not ${verb}` : `${count(skipped)} items were not ${verb}`;
}

export function skippedDetail(result: DriveChangeResult): string | null {
  return result.failed[0]?.reason ?? result.conflicts[0]?.name ?? null;
}
