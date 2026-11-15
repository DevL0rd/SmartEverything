import type { PhotosBackupPref } from '@smarteverything/domain';

export type FolderBackupChoice = Pick<PhotosBackupPref, 'enabled' | 'albumIds'>;

export function selectedFor(choice: FolderBackupChoice, backupId: string): boolean {
  return choice.albumIds.length === 0 || choice.albumIds.includes(backupId);
}

export function folderBacksUp(choice: FolderBackupChoice, backupId: string): boolean {
  return choice.enabled && selectedFor(choice, backupId);
}

function turnedOn(choice: FolderBackupChoice, backupId: string): FolderBackupChoice {
  if (choice.enabled) {
    return selectedFor(choice, backupId)
      ? choice
      : { enabled: true, albumIds: [...choice.albumIds, backupId] };
  }
  if (choice.albumIds.length === 0) return { enabled: true, albumIds: [backupId] };
  return {
    enabled: true,
    albumIds: choice.albumIds.includes(backupId) ? choice.albumIds : [...choice.albumIds, backupId],
  };
}

function turnedOff(
  choice: FolderBackupChoice,
  backupId: string,
  known: readonly string[],
): FolderBackupChoice {
  if (!folderBacksUp(choice, backupId)) return choice;
  const selected = choice.albumIds.length === 0 ? known : choice.albumIds;
  const rest = selected.filter((id) => id !== backupId);
  if (rest.length === 0) return { enabled: false, albumIds: choice.albumIds };
  return { enabled: true, albumIds: rest };
}

export function folderBackupChange(
  choice: FolderBackupChoice,
  backupId: string,
  on: boolean,
  known: readonly string[],
): FolderBackupChoice {
  return on ? turnedOn(choice, backupId) : turnedOff(choice, backupId, known);
}

export function backupStateLine(choice: FolderBackupChoice, backupId: string): string {
  if (folderBacksUp(choice, backupId)) return 'Backing up';
  return choice.enabled ? 'Not backed up' : 'Backup is off';
}
