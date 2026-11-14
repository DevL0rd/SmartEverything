import type { DriveChangeResult, DriveItem } from '@smarteverything/domain';
import type { ConfirmRequest } from '../../../components/confirm-store';
import { bytes, count } from '../../../format/number';
import { itemsText, totalsText, type TrashTotals } from './trash-model';

export const KEPT_NOTE = 'each item is kept a year, then deleted';

export const OWNER_NOTE =
  'Your drive’s trash is only yours. Shared Drive trash is seen by everyone in the home.';

export const MEMBER_NOTE =
  'Your drive’s trash is only yours. In the Shared Drive you delete for good only what you deleted.';

export function subtitleOf(totals: TrashTotals | null, compact: boolean): string {
  const kept = compact ? 'each kept a year' : KEPT_NOTE;
  return totals === null
    ? `Deleted files and folders · ${kept}`
    : `${totalsText(totals)} · ${kept}`;
}

export function deleteNowConfirm(totals: TrashTotals): ConfirmRequest {
  return {
    title: `Delete ${itemsText(totals.count)} now?`,
    body: `They leave for good and can't be restored. This frees ${bytes(totals.bytes)}.`,
    confirmLabel: 'Delete now',
    tone: 'destructive',
  };
}

export function deleteAllConfirm(totals: TrashTotals): ConfirmRequest {
  return {
    title: `Delete all ${itemsText(totals.count)} now?`,
    body: `Everything in Trash leaves for good and can't be restored. This frees ${bytes(totals.bytes)}.`,
    confirmLabel: 'Delete all now',
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

export function folderNameOf(item: DriveItem, rootLabel: string | null): string | null {
  const folders = item.relPath.split('/').slice(0, -1);
  return folders.at(-1) ?? rootLabel;
}

export function restoredAsText(item: DriveItem, rootLabel: string | null): string {
  const folder = folderNameOf(item, rootLabel);
  return folder === null ? `Restored as ${item.name}` : `Restored as ${item.name} in ${folder}`;
}

export function restoredText(restored: number): string {
  return `${itemsText(restored)} restored`;
}
