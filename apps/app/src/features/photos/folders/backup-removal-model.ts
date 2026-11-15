import { PHOTO_COPY_KEPT_REASONS, type PhotoCopyKeptReason } from '@smarteverything/domain';
import type { ConfirmRequest } from '../../../components/confirm-store';
import { bytes, count } from '../../../format/number';
import type { FolderCopies } from '../backup/runner/folder-copies';
import type { LocalPlace } from '../backup/runner/local-copies';
import { backupIdsBackedUp, type FolderBackupChoice } from './backup-model';

export interface RemovalPlan {
  readonly itemIds: readonly string[];
  readonly localIds: readonly string[];
  readonly bytes: number;
  readonly kept: Readonly<Record<PhotoCopyKeptReason, number>>;
}

export function planOf(copies: FolderCopies): RemovalPlan {
  const kept: Record<PhotoCopyKeptReason, number> = {
    other_device: 0,
    other_folder: 0,
    shared: 0,
    edited: 0,
    album: 0,
  };
  for (const reason of copies.kept.values()) kept[reason] += 1;
  return {
    itemIds: copies.items.map((item) => item.itemId),
    localIds: copies.items.flatMap((item) => item.localIds),
    bytes: copies.items.reduce((sum, item) => sum + item.bytes, 0),
    kept,
  };
}

export function keptTotal(plan: RemovalPlan): number {
  return Object.values(plan.kept).reduce((sum, total) => sum + total, 0);
}

function itemsText(total: number): string {
  return total === 1 ? '1 photo or video' : `${count(total)} photos and videos`;
}

const KEPT_TEXT: Readonly<Record<PhotoCopyKeptReason, (total: number) => string>> = {
  other_device: (total) => `${count(total)} also came from another device`,
  other_folder: (total) => `${count(total)} also came from another folder`,
  shared: (total) => `${count(total)} ${total === 1 ? 'is' : 'are'} in a shared drive`,
  edited: (total) => `${count(total)} ${total === 1 ? 'was' : 'were'} edited`,
  album: (total) => `${count(total)} ${total === 1 ? 'is' : 'are'} in albums`,
};

export function keptLine(plan: RemovalPlan): string | null {
  const parts = PHOTO_COPY_KEPT_REASONS.flatMap((reason) =>
    plan.kept[reason] === 0 ? [] : [KEPT_TEXT[reason](plan.kept[reason])],
  );
  if (parts.length === 0) return null;
  const total = keptTotal(plan);
  return `${count(total)} ${total === 1 ? 'stays' : 'stay'} on the Hub: ${parts.join(', ')}.`;
}

export function removalConfirm(
  plan: RemovalPlan,
  names: readonly string[],
  place: LocalPlace,
): ConfirmRequest {
  const [only] = names;
  const subject =
    names.length === 1 && only !== undefined ? only : `${count(names.length)} folders`;
  const kept = keptLine(plan);
  return {
    title: `Stop backing up ${subject}?`,
    body: [
      `${itemsText(plan.itemIds.length)} backed up from ${names.length === 1 ? 'it' : 'them'} ${plan.itemIds.length === 1 ? 'moves' : 'move'} to Recently deleted on the Hub, freeing ${bytes(plan.bytes)}. You can restore ${plan.itemIds.length === 1 ? 'it' : 'them'} there for a year.`,
      `The files on this ${place} are not touched.`,
      ...(kept === null ? [] : [kept]),
    ].join(' '),
    confirmLabel: 'Stop and remove',
    cancelLabel: 'Keep backing up',
    tone: 'destructive',
  };
}

export function stoppedIds(
  before: FolderBackupChoice,
  after: FolderBackupChoice,
  known: readonly string[],
): readonly string[] {
  const kept = new Set(backupIdsBackedUp(after, known));
  return backupIdsBackedUp(before, known).filter((id) => !kept.has(id));
}

export function namesOf(
  ids: readonly string[],
  choices: readonly { readonly id: string; readonly title: string }[],
): readonly string[] {
  const titles = new Map(choices.map((choice) => [choice.id, choice.title]));
  return ids.flatMap((id) => {
    const title = titles.get(id);
    return title === undefined ? [] : [title];
  });
}
