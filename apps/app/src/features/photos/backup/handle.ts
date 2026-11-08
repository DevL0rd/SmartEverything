import { ValueStore, useValue } from '../../../design/external-store';
import type { BackupRunner } from './runner/runner';

export interface BackupHandle {
  readonly runner: BackupRunner;
  readonly deviceId: string;
}

export const backupHandle = new ValueStore<BackupHandle | null>(null);

export function useBackupHandle(): BackupHandle | null {
  return useValue(backupHandle);
}
