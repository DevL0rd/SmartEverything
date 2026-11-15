import { PHOTO_COPY_KEPT_REASONS, type PhotoCopyKeptReason } from '@smarteverything/domain';
import type { ChoiceRequest } from '../../../components/confirm-store';
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
  return `${count(total)} ${total === 1 ? 'stays' : 'stay'} on the hub: ${parts.join(', ')}.`;
}

export function subjectOf(names: readonly string[]): string {
  const [only] = names;
  return names.length === 1 && only !== undefined ? only : `${count(names.length)} folders`;
}

export function removalConfirm(
  plan: RemovalPlan,
  names: readonly string[],
  place: LocalPlace,
): ChoiceRequest {
  const kept = keptLine(plan);
  const one = plan.itemIds.length === 1;
  return {
    title: `Stop backing up ${subjectOf(names)}?`,
    body: [
      `Removing ${one ? 'the copy' : 'the copies'} moves ${itemsText(plan.itemIds.length)} backed up from ${names.length === 1 ? 'it' : 'them'} to Recently deleted on the hub, freeing ${bytes(plan.bytes)}. You can restore ${one ? 'it' : 'them'} there for a year.`,
      `The files on this ${place} are not touched.`,
      ...(kept === null ? [] : [kept]),
    ].join(' '),
    confirmLabel: 'Stop and remove',
    alternateLabel: 'Stop and keep copies',
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
