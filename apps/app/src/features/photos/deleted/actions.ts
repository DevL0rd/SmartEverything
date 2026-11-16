import type { DriveChangeResult } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { confirm, type ConfirmRequest } from '../../../components/confirm-store';
import { notify } from '../../../components/toast-store';
import { keptLine, useBulkRunning } from '../../../store/bulk-run';
import { changeDriveInBatches, type DriveBulk, type DriveChanger } from '../../../store/drive-bulk';
import { restoreLocalCopiesWithNotice } from '../library/local-copies';
import {
  deleteAllConfirm,
  deleteNowConfirm,
  skippedDetail,
  skippedText,
  type DeletedVerb,
} from './copy';
import { totalsOf, type DeletedItem } from './model';

export interface DeletedActions {
  readonly busy: boolean;
  readonly restore: (items: readonly DeletedItem[]) => void;
  readonly deleteNow: (items: readonly DeletedItem[]) => void;
  readonly deleteAll: (items: readonly DeletedItem[]) => void;
}

export function reportSkipped(result: DriveChangeResult, verb: DeletedVerb): void {
  const message = skippedText(result, verb);
  if (message === null) return;
  const detail = skippedDetail(result);
  notify({ message, tone: 'critical', ...(detail === null ? {} : { detail }) });
}

function idsOf(items: readonly DeletedItem[]): readonly string[] {
  return items.map((item) => item.id);
}

export function restoreLocalOf(result: DriveChangeResult): void {
  const restored = result.done.map((entry) => entry.itemId);
  if (restored.length === 0) return;
  background(restoreLocalCopiesWithNotice(restored), 'photos.deleted.local_restore_failed');
}

interface DeletedRun {
  readonly bulk: DriveBulk;
  readonly verb: DeletedVerb;
  readonly failure: string;
  readonly onDone: () => void;
}

export async function runDeleted(
  run: DeletedRun,
  change?: DriveChanger,
): Promise<DriveChangeResult | null> {
  try {
    const { result, outcome } = await changeDriveInBatches(run.bulk, change);
    reportSkipped(result, run.verb);
    if (outcome.reason !== null && outcome.kept.length > result.failed.length) {
      notify({ message: run.failure, detail: keptLine(outcome, outcome.reason), tone: 'critical' });
    }
    run.onDone();
    return result;
  } catch (error) {
    notify({ message: run.failure, error, tone: 'critical' });
    return null;
  }
}

async function restoreNow(items: readonly DeletedItem[], onDone: () => void): Promise<void> {
  const result = await runDeleted({
    bulk: {
      label: 'photos.deleted.restore',
      verb: 'Restoring',
      ids: idsOf(items),
      body: (batch) => ({ action: 'restore', itemIds: batch }),
    },
    verb: 'restored',
    failure: 'Not everything was restored',
    onDone,
  });
  if (result !== null) restoreLocalOf(result);
}

async function removeNow(
  items: readonly DeletedItem[],
  request: ConfirmRequest,
  onDone: () => void,
): Promise<void> {
  if (!(await confirm(request))) return;
  await runDeleted({
    bulk: {
      label: 'photos.deleted.delete_now',
      verb: 'Deleting',
      ids: idsOf(items),
      body: (batch) => ({ action: 'delete_now', itemIds: batch }),
    },
    verb: 'deleted',
    failure: 'Not everything was deleted',
    onDone,
  });
}

export function useDeletedActions(onDone: () => void): DeletedActions {
  const confirmed = (items: readonly DeletedItem[], request: ConfirmRequest): void => {
    if (items.length === 0) return;
    background(removeNow(items, request, onDone), 'photos.deleted.delete_failed');
  };
  return {
    busy: useBulkRunning(),
    restore: (items): void => {
      if (items.length === 0) return;
      background(restoreNow(items, onDone), 'photos.deleted.restore_failed');
    },
    deleteNow: (items): void => {
      confirmed(items, deleteNowConfirm(totalsOf(items)));
    },
    deleteAll: (items): void => {
      confirmed(items, deleteAllConfirm(totalsOf(items)));
    },
  };
}
