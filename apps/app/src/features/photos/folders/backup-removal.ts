import type { DriveChangeResult } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { changeDrive } from '../../../api/drive';
import { choose, type ChoiceRequest, type ConfirmOutcome } from '../../../components/confirm-store';
import { notify } from '../../../components/toast-store';
import { bytes, count } from '../../../format/number';
import { backupHandle } from '../backup/handle';
import type { FolderCopies } from '../backup/runner/folder-copies';
import type { LocalPlace } from '../backup/runner/local-copies';
import { planOf, removalConfirm, subjectOf, type RemovalPlan } from './backup-removal-model';

const log = new Logger('app.photos');

export interface FoundCopies {
  readonly copies: FolderCopies;
  readonly place: LocalPlace;
  readonly forget: (localIds: readonly string[]) => Promise<void>;
}

export interface RemovalDeps {
  readonly copies: (backupIds: readonly string[]) => Promise<FoundCopies | null>;
  readonly choose: (request: ChoiceRequest) => Promise<ConfirmOutcome>;
  readonly trash: (itemIds: readonly string[]) => Promise<DriveChangeResult>;
}

export const LIVE_REMOVAL: RemovalDeps = {
  async copies(backupIds) {
    const handle = backupHandle.get();
    if (handle === null) {
      log.warn('photos.folders.backup_stop_without_runner', { folders: backupIds.length });
      return null;
    }
    const { runner } = handle;
    return {
      copies: await runner.folderCopies(backupIds),
      place: runner.place,
      forget: (localIds) => runner.forgetFolderCopies(localIds),
    };
  },
  choose,
  trash: (itemIds) => changeDrive({ action: 'trash', itemIds }),
};

function itemsText(total: number): string {
  return total === 1 ? '1 photo or video' : `${count(total)} photos and videos`;
}

async function removeCopies(
  plan: RemovalPlan,
  found: FoundCopies,
  deps: RemovalDeps,
): Promise<void> {
  const { copies } = found;
  const result = await deps.trash(plan.itemIds);
  const removed = new Set(result.done.map((entry) => entry.itemId));
  await found.forget(
    copies.items.filter((item) => removed.has(item.itemId)).flatMap((item) => item.localIds),
  );
  const freed = copies.items
    .filter((item) => removed.has(item.itemId))
    .reduce((sum, item) => sum + item.bytes, 0);
  log.info('photos.folders.backup_copies_removed', {
    asked: plan.itemIds.length,
    removed: removed.size,
    failed: result.failed.length,
  });
  if (removed.size > 0)
    notify({
      message: `Moved ${itemsText(removed.size)} to Recently deleted`,
      detail: `This frees ${bytes(freed)} on the hub. They can be restored for a year.`,
    });
  const skipped = plan.itemIds.length - removed.size;
  if (skipped > 0)
    notify({
      message: `${itemsText(skipped)} stayed on the hub`,
      ...(result.failed[0] === undefined ? {} : { detail: result.failed[0].reason }),
      tone: 'critical',
    });
}

function notifyKept(names: readonly string[]): void {
  notify({
    message: `Stopped backing up ${subjectOf(names)}`,
    detail: 'Copies already on the hub stay there.',
  });
}

export async function stopFolderBackup(
  backupIds: readonly string[],
  names: readonly string[],
  apply: () => Promise<void>,
  deps: RemovalDeps = LIVE_REMOVAL,
): Promise<boolean> {
  if (backupIds.length === 0) {
    await apply();
    return true;
  }
  const found = await deps.copies(backupIds);
  if (found === null) {
    await apply();
    notifyKept(names);
    return true;
  }
  const plan = planOf(found.copies);
  if (plan.itemIds.length === 0) {
    await apply();
    return true;
  }
  const outcome = await deps.choose(removalConfirm(plan, names, found.place));
  log.info('photos.folders.backup_stop_answered', { outcome, items: plan.itemIds.length });
  if (outcome === 'cancel') return false;
  await apply();
  if (outcome === 'alternate') {
    notifyKept(names);
    return true;
  }
  await removeCopies(plan, found, deps);
  return true;
}
