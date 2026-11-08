import { ValueStore, usePausable } from '../../../../design/external-store';
import type { PauseReason } from './conditions';

export type BackupPhase =
  'off' | 'unavailable' | 'denied' | 'idle' | 'scanning' | 'uploading' | 'paused';

export interface BackupStatus {
  readonly phase: BackupPhase;
  readonly pauseReason: PauseReason | null;
  readonly limitedAccess: boolean;
  readonly total: number;
  readonly done: number;
  readonly failed: number;
  readonly bytesLeft: number;
  readonly current: string | null;
  readonly lastBackupAt: string | null;
  readonly problem: string | null;
}

export const INITIAL_BACKUP_STATUS: BackupStatus = {
  phase: 'off',
  pauseReason: null,
  limitedAccess: false,
  total: 0,
  done: 0,
  failed: 0,
  bytesLeft: 0,
  current: null,
  lastBackupAt: null,
  problem: null,
};

export const backupStatus = new ValueStore<BackupStatus>(INITIAL_BACKUP_STATUS);

export function patchBackupStatus(patch: Partial<BackupStatus>): void {
  backupStatus.update((current) => ({ ...current, ...patch }));
}

export function useBackupStatus(): BackupStatus {
  return usePausable(backupStatus.subscribe, backupStatus.get);
}
