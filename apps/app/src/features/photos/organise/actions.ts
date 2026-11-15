import { router } from 'expo-router';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { confirm } from '../../../components/confirm-store';
import type { MenuItem } from '../../../components/menu';
import { notify } from '../../../components/toast-store';
import { count } from '../../../format/number';
import { useMutationState } from '../../../store/mutation';
import { archivePhotos, moveIntoLockedFolder, readLockedState, unarchivePhotos } from './api';
import { openMetaEdit, type MetaCurrent } from './meta/meta-request';

export interface OrganiseActions {
  readonly busy: boolean;
  readonly archive: (itemIds: readonly string[], onDone?: () => void) => void;
  readonly unarchive: (itemIds: readonly string[], onDone?: () => void) => void;
  readonly lock: (itemIds: readonly string[], onDone?: () => void) => void;
}

export function itemsText(total: number): string {
  return total === 1 ? '1 item' : `${count(total)} items`;
}

export function lockConfirmOf(total: number): Parameters<typeof confirm>[0] {
  return {
    title: `Move ${itemsText(total)} to the Locked folder?`,
    body: 'They leave the library, albums, search, sharing and the AI. Only you can open them, with your Locked folder PIN.',
    confirmLabel: 'Move',
  };
}

function restoreArchived(itemIds: readonly string[]): void {
  unarchivePhotos(itemIds).catch((error: unknown) => {
    notify({ message: 'The photos stayed in Archive', error, tone: 'critical' });
  });
}

async function lockable(): Promise<boolean> {
  const state = await readLockedState();
  if (state.configured) return true;
  notify({
    message: 'Set up the Locked folder first',
    action: {
      label: 'Set up',
      onPress: (): void => {
        router.push(href.photosPage('locked'));
      },
    },
  });
  return false;
}

export function useOrganiseActions(): OrganiseActions {
  const mutation = useMutationState();
  const lockNow = async (itemIds: readonly string[], onDone?: () => void): Promise<void> => {
    if (!(await lockable()) || !(await confirm(lockConfirmOf(itemIds.length)))) return;
    mutation.run(() => moveIntoLockedFolder(itemIds), {
      failure: 'Nothing moved to the Locked folder',
      label: 'photos.organise.lock',
      onDone: (changed) => {
        notify({ message: `${itemsText(changed.count)} moved to the Locked folder` });
        onDone?.();
      },
    });
  };
  return {
    busy: mutation.busy,
    archive: (itemIds, onDone): void => {
      mutation.run(() => archivePhotos(itemIds), {
        failure: 'Nothing was archived',
        label: 'photos.organise.archive',
        onDone: (changed) => {
          notify({
            message: `${itemsText(changed.count)} archived`,
            undo: () => {
              restoreArchived(itemIds);
            },
          });
          onDone?.();
        },
      });
    },
    unarchive: (itemIds, onDone): void => {
      mutation.run(() => unarchivePhotos(itemIds), {
        failure: 'Nothing left Archive',
        label: 'photos.organise.unarchive',
        onDone: (changed) => {
          notify({ message: `${itemsText(changed.count)} back in the library` });
          onDone?.();
        },
      });
    },
    lock: (itemIds, onDone): void => {
      background(lockNow(itemIds, onDone), 'photos.organise.lock_failed');
    },
  };
}

export interface OrganiseMenuInput {
  readonly actions: OrganiseActions;
  readonly itemIds: readonly string[];
  readonly current: MetaCurrent | null;
  readonly archived: boolean | null;
  readonly onGone?: () => void;
  readonly onSaved?: () => void;
}

function archiveItem(input: OrganiseMenuInput, none: boolean): MenuItem {
  const { actions, itemIds, archived, onGone } = input;
  const disabled = none || actions.busy || archived === null;
  if (archived === true) {
    return {
      id: 'unarchive',
      label: 'Unarchive',
      icon: 'archiveRestore',
      disabled,
      onPress: (): void => {
        actions.unarchive(itemIds);
      },
    };
  }
  return {
    id: 'archive',
    label: 'Archive',
    icon: 'archive',
    disabled,
    onPress: (): void => {
      actions.archive(itemIds, onGone);
    },
  };
}

export function organiseMenuItems(input: OrganiseMenuInput): readonly MenuItem[] {
  const { actions, itemIds, current, onGone, onSaved } = input;
  const none = itemIds.length === 0;
  return [
    {
      id: 'edit-meta',
      label: 'Edit date and location',
      icon: 'calendar',
      disabled: none,
      onPress: (): void => {
        openMetaEdit({ itemIds, current, ...(onSaved === undefined ? {} : { onSaved }) });
      },
    },
    archiveItem(input, none),
    {
      id: 'lock',
      label: 'Move to Locked folder',
      icon: 'lock',
      disabled: none || actions.busy,
      onPress: (): void => {
        actions.lock(itemIds, onGone);
      },
    },
  ];
}
