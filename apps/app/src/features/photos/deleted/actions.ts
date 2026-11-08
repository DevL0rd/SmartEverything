import type { DriveChangeResult } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { changeDrive } from '../../../api/drive';
import { confirm, type ConfirmRequest } from '../../../components/confirm-store';
import { notify } from '../../../components/toast-store';
import { useMutationState } from '../../../store/mutation';
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

export function useDeletedActions(onDone: () => void): DeletedActions {
  const mutation = useMutationState();
  const settled =
    (verb: DeletedVerb) =>
    (result: DriveChangeResult): void => {
      reportSkipped(result, verb);
      onDone();
    };
  const restore = (items: readonly DeletedItem[]): void => {
    if (items.length === 0) return;
    mutation.run(() => changeDrive({ action: 'restore', itemIds: idsOf(items) }), {
      failure: 'Nothing was restored',
      label: 'photos.deleted.restore',
      onDone: settled('restored'),
    });
  };
  const remove = async (items: readonly DeletedItem[], request: ConfirmRequest): Promise<void> => {
    if (!(await confirm(request))) return;
    mutation.run(() => changeDrive({ action: 'delete_now', itemIds: idsOf(items) }), {
      failure: 'Nothing was deleted',
      label: 'photos.deleted.delete_now',
      onDone: settled('deleted'),
    });
  };
  const confirmed = (items: readonly DeletedItem[], request: ConfirmRequest): void => {
    if (items.length === 0) return;
    background(remove(items, request), 'photos.deleted.delete_failed');
  };
  return {
    busy: mutation.busy,
    restore,
    deleteNow: (items): void => {
      confirmed(items, deleteNowConfirm(totalsOf(items)));
    },
    deleteAll: (items): void => {
      confirmed(items, deleteAllConfirm(totalsOf(items)));
    },
  };
}
