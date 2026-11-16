import { router } from 'expo-router';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { confirm } from '../../../components/confirm-store';
import type { MenuItem } from '../../../components/menu';
import { notify } from '../../../components/toast-store';
import { count } from '../../../format/number';
import { BULK_BATCH, keptLine, runBulk, useBulkRunning } from '../../../store/bulk-run';
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

interface Counted {
  readonly label: string;
  readonly verb: string;
  readonly failure: string;
  readonly ids: readonly string[];
  readonly call: (batch: readonly string[]) => Promise<{ readonly count: number }>;
}

async function runCounted(work: Counted): Promise<number | null> {
  let changed = 0;
  try {
    const outcome = await runBulk({
      label: work.label,
      verb: work.verb,
      ids: work.ids,
      batch: BULK_BATCH,
      send: async (batch) => {
        changed += (await work.call(batch)).count;
        return { failed: [] };
      },
    });
    if (outcome.reason === null) return changed;
    notify({
      message: work.failure,
      detail: keptLine(outcome, outcome.reason),
      tone: 'critical',
    });
    return null;
  } catch (error) {
    notify({ message: work.failure, error, tone: 'critical' });
    return null;
  }
}

async function archiveNow(itemIds: readonly string[], onDone?: () => void): Promise<void> {
  const changed = await runCounted({
    label: 'photos.organise.archive',
    verb: 'Archiving',
    failure: 'Not everything was archived',
    ids: itemIds,
    call: archivePhotos,
  });
  if (changed === null) return;
  notify({
    message: `${itemsText(changed)} archived`,
    undo: () => {
      restoreArchived(itemIds);
    },
  });
  onDone?.();
}

async function unarchiveNow(itemIds: readonly string[], onDone?: () => void): Promise<void> {
  const changed = await runCounted({
    label: 'photos.organise.unarchive',
    verb: 'Moving back to the library',
    failure: 'Not everything left Archive',
    ids: itemIds,
    call: unarchivePhotos,
  });
  if (changed === null) return;
  notify({ message: `${itemsText(changed)} back in the library` });
  onDone?.();
}

async function lockNow(itemIds: readonly string[], onDone?: () => void): Promise<void> {
  if (!(await lockable()) || !(await confirm(lockConfirmOf(itemIds.length)))) return;
  const changed = await runCounted({
    label: 'photos.organise.lock',
    verb: 'Moving to the Locked folder',
    failure: 'Not everything moved to the Locked folder',
    ids: itemIds,
    call: moveIntoLockedFolder,
  });
  if (changed === null) return;
  notify({ message: `${itemsText(changed)} moved to the Locked folder` });
  onDone?.();
}

export function useOrganiseActions(): OrganiseActions {
  return {
    busy: useBulkRunning(),
    archive: (itemIds, onDone): void => {
      background(archiveNow(itemIds, onDone), 'photos.organise.archive_failed');
    },
    unarchive: (itemIds, onDone): void => {
      background(unarchiveNow(itemIds, onDone), 'photos.organise.unarchive_failed');
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
