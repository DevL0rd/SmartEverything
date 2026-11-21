import { ApiError, type DriveItem, type DrivePlacement } from '@smarteverything/domain';
import type { StoredDrive } from '../../store/repositories/drive-roots';
import type { Store } from '../../store/store';

export type SyncMode = 'sync' | 'subscribe';

export interface SyncScope {
  readonly placement: DrivePlacement;
  readonly drive: StoredDrive;
  readonly base: DriveItem | null;
  readonly excluded: readonly string[];
  readonly indexId: string;
  readonly writable: boolean;
}

export function syncScopeOf(
  store: Pick<Store, 'host'>,
  placementId: string,
  deviceId: string,
  mode: SyncMode,
): Promise<SyncScope> {
  return store.host.read('driveSyncScope', { placementId, deviceId, mode });
}

export function assertWritable(scope: SyncScope): void {
  if (!scope.writable) {
    throw new ApiError('forbidden', 'This folder is receive only on this computer.');
  }
}
