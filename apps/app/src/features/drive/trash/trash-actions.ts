import { router } from 'expo-router';
import type { DriveChangeResult, DriveItem } from '@smarteverything/domain';
import { background, Logger } from '@smarteverything/logging';
import { changeDrive, readDriveItem } from '../../../api/drive';
import { confirm, type ConfirmRequest } from '../../../components/confirm-store';
import { notify } from '../../../components/toast-store';
import { errorFields } from '../../../design/log-tally';
import { useMutationState } from '../../../store/mutation';
import { openHrefOf } from '../recent/recent-model';
import {
  deleteAllConfirm,
  deleteNowConfirm,
  restoredAsText,
  restoredText,
  skippedDetail,
  skippedText,
  type TrashVerb,
} from './trash-copy';
import { totalsOf, type TrashItem } from './trash-model';

const log = new Logger('app.drive');

export interface TrashActions {
  readonly busy: boolean;
  readonly restore: (items: readonly TrashItem[]) => void;
  readonly deleteNow: (items: readonly TrashItem[]) => void;
  readonly deleteAll: (items: readonly TrashItem[]) => void;
}

export type RootLabelOf = (rootId: string) => string | null;

export function reportSkipped(result: DriveChangeResult, verb: TrashVerb): void {
  const message = skippedText(result, verb);
  if (message === null) return;
  const detail = skippedDetail(result);
  notify({ message, tone: 'critical', ...(detail === null ? {} : { detail }) });
}

export function restoredAsToast(item: DriveItem, rootLabelOf: RootLabelOf): void {
  notify({
    message: restoredAsText(item, rootLabelOf(item.rootId)),
    tone: 'positive',
    action: {
      label: 'Open',
      onPress: () => {
        router.push(openHrefOf(item));
      },
    },
  });
}

async function announceOne(itemId: string, rootLabelOf: RootLabelOf): Promise<void> {
  try {
    restoredAsToast(await readDriveItem(itemId), rootLabelOf);
  } catch (error: unknown) {
    log.warn('drive_trash.restored_item_unread', { itemId, ...errorFields(error) });
    notify({ message: restoredText(1), tone: 'positive' });
  }
}

export function announceRestored(result: DriveChangeResult, rootLabelOf: RootLabelOf): void {
  reportSkipped(result, 'restored');
  const [only, ...rest] = result.done;
  if (only === undefined) return;
  if (rest.length === 0 && only.resultItemId !== null) {
    background(announceOne(only.resultItemId, rootLabelOf), 'drive_trash.announce_failed');
    return;
  }
  notify({ message: restoredText(result.done.length), tone: 'positive' });
}

function idsOf(items: readonly TrashItem[]): readonly string[] {
  return items.map((item) => item.id);
}

export function useTrashActions(onDone: () => void, rootLabelOf: RootLabelOf): TrashActions {
  const mutation = useMutationState();
  const restore = (items: readonly TrashItem[]): void => {
    if (items.length === 0) return;
    mutation.run(() => changeDrive({ action: 'restore', itemIds: idsOf(items) }), {
      failure: 'Nothing was restored',
      label: 'drive.trash.restore',
      onDone: (result) => {
        announceRestored(result, rootLabelOf);
        onDone();
      },
    });
  };
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
  const confirmed = (items: readonly TrashItem[], request: ConfirmRequest): void => {
    if (items.length === 0) return;
    background(remove(items, request), 'drive_trash.delete_failed');
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
