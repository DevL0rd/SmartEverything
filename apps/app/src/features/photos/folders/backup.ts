import { background } from '@smarteverything/logging';
import { notify } from '../../../components/toast-store';
import { useEntityStore } from '../../../store/store-context';
import { prefOf, PREFS, savePref, usePref } from '../../../store/prefs';
import type { EntityStore } from '../../../store/entity-store';
import { changeBackupEnabled } from '../backup/activation';
import { folderBackupChange, folderBacksUp, type FolderBackupChoice } from './backup-model';
import { stopFolderBackup } from './backup-removal';
import { stoppedIds } from './backup-removal-model';

export interface BackupFolder {
  readonly backupId: string;
  readonly name: string;
}

export interface FolderBackup {
  readonly choice: FolderBackupChoice | null;
  readonly on: (backupId: string) => boolean;
  readonly set: (folder: BackupFolder, on: boolean) => void;
}

async function applyChange(
  store: EntityStore,
  folder: BackupFolder,
  on: boolean,
  known: readonly string[],
): Promise<void> {
  const pref = prefOf(store.get(), PREFS.photosBackup);
  if (pref.status === 'invalid') throw new Error(pref.reason);
  const next = folderBackupChange(pref.value, folder.backupId, on, known);
  const save = async (): Promise<void> => {
    savePref(store, PREFS.photosBackup, { ...pref.value, albumIds: [...next.albumIds] });
    if (next.enabled !== pref.value.enabled) await changeBackupEnabled(store, next.enabled);
  };
  if (on) {
    await save();
    return;
  }
  await stopFolderBackup(stoppedIds(pref.value, next, known), [folder.name], save);
}

export function useFolderBackup(known: readonly string[]): FolderBackup {
  const store = useEntityStore();
  const pref = usePref(PREFS.photosBackup);
  const choice = pref.status === 'ready' ? pref.value : null;
  return {
    choice,
    on: (backupId) => choice !== null && folderBacksUp(choice, backupId),
    set: (folder, on): void => {
      background(
        applyChange(store, folder, on, known).catch((error: unknown) => {
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
