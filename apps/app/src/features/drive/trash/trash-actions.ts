import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { DriveChangeResult } from '@smarteverything/domain';
import { changeDrive } from '../../../api/drive';
import { background } from '@smarteverything/logging';
import { confirm, type ConfirmRequest } from '../../../components/confirm-store';
import { notify } from '../../../components/toast-store';
import { keptLine, useBulkRunning } from '../../../store/bulk-run';
import { changeDriveInBatches } from '../../../store/drive-bulk';
import {
  deleteConfirmOf,
  skippedDetail,
  skippedText,
  type DeleteScope,
  type TrashVerb,
} from './trash-copy';
import { shownDriveChange } from '../data/shown';
import { totalsOf, type TrashItem } from './trash-model';

export interface TrashActions {
  readonly busy: boolean;
  readonly deleteAll: (items: readonly TrashItem[], scope: DeleteScope) => void;
}

export function reportSkipped(result: DriveChangeResult, verb: TrashVerb): void {
  const message = skippedText(result, verb);
  if (message === null) return;
  const detail = skippedDetail(result);
  notify({ message, tone: 'critical', ...(detail === null ? {} : { detail }) });
}

function idsOf(items: readonly TrashItem[]): readonly string[] {
  return items.map((item) => item.id);
}

async function removeNow(
  client: QueryClient,
  items: readonly TrashItem[],
  request: ConfirmRequest,
  onDone: () => void,
): Promise<void> {
  if (!(await confirm(request))) return;
  const failure = 'Not everything was deleted';
  try {
    const { result, outcome } = await changeDriveInBatches(
      {
        label: 'drive.trash.delete_now',
        verb: 'Deleting',
        ids: idsOf(items),
        body: (batch) => ({ action: 'delete_now', itemIds: batch }),
      },
      shownDriveChange(client, changeDrive),
    );
    reportSkipped(result, 'deleted');
    if (outcome.reason !== null && outcome.kept.length > result.failed.length) {
      notify({ message: failure, detail: keptLine(outcome, outcome.reason), tone: 'critical' });
    }
    onDone();
  } catch (error) {
    notify({ message: failure, error, tone: 'critical' });
  }
}

export function useTrashActions(onDone: () => void): TrashActions {
  const client = useQueryClient();
  return {
    busy: useBulkRunning(),
    deleteAll: (items, scope): void => {
      if (items.length === 0) return;
      background(
        removeNow(client, items, deleteConfirmOf(scope, totalsOf(items)), onDone),
        'drive_trash.delete_failed',
      );
    },
  };
}
