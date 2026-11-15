import type { DriveChangeResult } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { changeDrive } from '../../../api/drive';
import { confirm, type ConfirmRequest } from '../../../components/confirm-store';
import { notify } from '../../../components/toast-store';
import { bytes, count } from '../../../format/number';
import { backupHandle } from '../backup/handle';
import type { FolderCopies } from '../backup/runner/folder-copies';
import type { LocalPlace } from '../backup/runner/local-copies';
import { planOf, removalConfirm, type RemovalPlan } from './backup-removal-model';

const log = new Logger('app.photos');

export interface FoundCopies {
  readonly copies: FolderCopies;
  readonly place: LocalPlace;
  readonly forget: (localIds: readonly string[]) => Promise<void>;
}

export interface RemovalDeps {
  readonly copies: (backupIds: readonly string[]) => Promise<FoundCopies | null>;
  readonly confirm: (request: ConfirmRequest) => Promise<boolean>;
  readonly trash: (itemIds: readonly string[]) => Promise<DriveChangeResult>;
}

export const LIVE_REMOVAL: RemovalDeps = {
  async copies(backupIds) {
    const handle = backupHandle.get();
    if (handle === null) {
      log.warn('photos.folders.backup_stop_without_runner', { folders: backupIds.length });
      notify({
        message: 'Backup is not running on this device',
        detail: 'Copies already on the Hub stay there.',
      });
      return null;
    }
    const { runner } = handle;
    return {
      copies: await runner.folderCopies(backupIds),
      place: runner.place,
      forget: (localIds) => runner.forgetFolderCopies(localIds),
    };
  },
  confirm,
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
      detail: `This frees ${bytes(freed)} on the Hub. They can be restored for a year.`,
    });
  const skipped = plan.itemIds.length - removed.size;
  if (skipped > 0)
    notify({
      message: `${itemsText(skipped)} stayed on the Hub`,
      ...(result.failed[0] === undefined ? {} : { detail: result.failed[0].reason }),
      tone: 'critical',
    });
}

export async function stopFolderBackup(
  backupIds: readonly string[],
  names: readonly string[],
  apply: () => Promise<void>,
  deps: RemovalDeps = LIVE_REMOVAL,
): Promise<boolean> {
  const found = backupIds.length === 0 ? null : await deps.copies(backupIds);
  const plan = found === null ? null : planOf(found.copies);
  if (found === null || plan === null || plan.itemIds.length === 0) {
    await apply();
    return true;
  }
  if (!(await deps.confirm(removalConfirm(plan, names, found.place)))) {
    log.info('photos.folders.backup_stop_cancelled', { items: plan.itemIds.length });
    return false;
  }
  await apply();
  await removeCopies(plan, found, deps);
  return true;
}
