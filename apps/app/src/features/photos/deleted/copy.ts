import type { DriveChangeResult } from '@smarteverything/domain';
import type { ConfirmRequest } from '../../../components/confirm-store';
import { bytes } from '../../../format/number';
import { itemsText, totalsText, type DeletedTotals } from './model';

export const DELETED_SUBTITLE = 'Items stay here for a year, then leave for good';

export function subtitleOf(totals: DeletedTotals, compact: boolean): string {
  return compact && totals.count > 0 ? `${totalsText(totals)} · kept a year` : DELETED_SUBTITLE;
}

export const OWNER_NOTE =
  'Members see and restore only what they deleted. Delete now is for the owner.';

export const MEMBER_NOTE =
  'You see and restore what you deleted. Only the owner can delete items for good.';

export const READ_ONLY_NOTE =
  "Files in a read-only library folder never come here: SmartEverything can't change them.";

export function deleteNowConfirm(totals: DeletedTotals): ConfirmRequest {
  return {
    title: `Delete ${itemsText(totals.count)} now?`,
    body: `They leave for good and can't be restored. This frees ${bytes(totals.bytes)}.`,
    confirmLabel: 'Delete now',
    tone: 'destructive',
  };
}

export function deleteAllConfirm(totals: DeletedTotals): ConfirmRequest {
  return {
    title: `Delete all ${itemsText(totals.count)} now?`,
    body: `Everything in Recently deleted leaves for good and can't be restored. This frees ${bytes(totals.bytes)}.`,
    confirmLabel: 'Delete all now',
    tone: 'destructive',
  };
}

export type DeletedVerb = 'restored' | 'deleted';

export function skippedText(result: DriveChangeResult, verb: DeletedVerb): string | null {
  const skipped = result.failed.length + result.conflicts.length;
  if (skipped === 0) return null;
  return skipped === 1 ? `1 item was not ${verb}` : `${String(skipped)} items were not ${verb}`;
}

export function skippedDetail(result: DriveChangeResult): string | null {
  return result.failed[0]?.reason ?? result.conflicts[0]?.name ?? null;
}
