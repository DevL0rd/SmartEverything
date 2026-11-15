import { background } from '@smarteverything/logging';
import { notify } from '../../../components/toast-store';
import { useEntityStore } from '../../../store/store-context';
import { prefOf, PREFS, savePref, usePref } from '../../../store/prefs';
import type { EntityStore } from '../../../store/entity-store';
import { changeBackupEnabled } from '../backup/activation';
import { folderBackupChange, folderBacksUp, type FolderBackupChoice } from './backup-model';

export interface FolderBackup {
  readonly choice: FolderBackupChoice | null;
  readonly on: (backupId: string) => boolean;
  readonly set: (backupId: string, on: boolean) => void;
}

async function applyChange(
  store: EntityStore,
  backupId: string,
  on: boolean,
  known: readonly string[],
): Promise<void> {
  const pref = prefOf(store.get(), PREFS.photosBackup);
  if (pref.status === 'invalid') throw new Error(pref.reason);
  const next = folderBackupChange(pref.value, backupId, on, known);
  savePref(store, PREFS.photosBackup, { ...pref.value, albumIds: [...next.albumIds] });
  if (next.enabled !== pref.value.enabled) await changeBackupEnabled(store, next.enabled);
}

export function useFolderBackup(known: readonly string[]): FolderBackup {
  const store = useEntityStore();
  const pref = usePref(PREFS.photosBackup);
  const choice = pref.status === 'ready' ? pref.value : null;
  return {
    choice,
    on: (backupId) => choice !== null && folderBacksUp(choice, backupId),
    set: (backupId, on): void => {
      background(
        applyChange(store, backupId, on, known).catch((error: unknown) => {
          notify({
            message: on
              ? 'The folder was not added to backup'
              : 'The folder was not removed from backup',
            error,
            tone: 'critical',
          });
        }),
        'photos.folders.backup_change_failed',
      );
    },
  };
}
