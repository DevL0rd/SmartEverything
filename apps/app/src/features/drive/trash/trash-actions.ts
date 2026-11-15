import type { DriveChangeResult } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { changeDrive } from '../../../api/drive';
import { confirm, type ConfirmRequest } from '../../../components/confirm-store';
import { notify } from '../../../components/toast-store';
import { useMutationState } from '../../../store/mutation';
import { deleteAllConfirm, skippedDetail, skippedText, type TrashVerb } from './trash-copy';
import { totalsOf, type TrashItem } from './trash-model';

export interface TrashActions {
  readonly busy: boolean;
  readonly deleteAll: (items: readonly TrashItem[]) => void;
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

export function useTrashActions(onDone: () => void): TrashActions {
  const mutation = useMutationState();
  const remove = async (items: readonly TrashItem[], request: ConfirmRequest): Promise<void> => {
    if (!(await confirm(request))) return;
    mutation.run(() => changeDrive({ action: 'delete_now', itemIds: idsOf(items) }), {
      failure: 'Nothing was deleted',
      label: 'drive.trash.delete_now',
      onDone: (result) => {
        reportSkipped(result, 'deleted');
        onDone();
      },
    });
  };
  return {
    busy: mutation.busy,
    deleteAll: (items): void => {
      if (items.length === 0) return;
      background(remove(items, deleteAllConfirm(totalsOf(items))), 'drive_trash.delete_failed');
    },
  };
}
