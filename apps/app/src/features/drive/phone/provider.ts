import type { DriveChangedNotice } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import {
  clearDriveOffline,
  configureDriveDocuments,
  driveDocumentsLinked,
  driveOfflineStatus,
  forgetDriveDocuments,
  notifyDriveDocumentsChanged,
  syncDriveOffline,
  type DriveOfflineStatus,
} from '../../../../modules/health-connect';

export interface DriveProviderLink {
  readonly linked: () => boolean;
  readonly configure: (clientId: string) => Promise<void>;
  readonly forget: () => Promise<void>;
  readonly notifyChanged: (
    rootIds: readonly string[],
    folderIds: readonly string[],
  ) => Promise<void>;
  readonly offlineStatus: () => Promise<DriveOfflineStatus>;
  readonly offlineSync: () => Promise<void>;
  readonly offlineClear: () => Promise<void>;
}

export const nativeDriveProvider: DriveProviderLink = {
  linked: driveDocumentsLinked,
  configure: configureDriveDocuments,
  forget: forgetDriveDocuments,
  notifyChanged: notifyDriveDocumentsChanged,
  offlineStatus: driveOfflineStatus,
  offlineSync: syncDriveOffline,
  offlineClear: clearDriveOffline,
};

export async function forwardDriveChange(
  link: DriveProviderLink,
  notice: Pick<DriveChangedNotice, 'rootIds' | 'folderIds'>,
): Promise<boolean> {
  if (!link.linked()) return false;
  if (notice.rootIds.length === 0 && notice.folderIds.length === 0) return false;
  await link.notifyChanged(notice.rootIds, notice.folderIds);
  return true;
}

export function forwardDriveChanged(notice: DriveChangedNotice): void {
  background(forwardDriveChange(nativeDriveProvider, notice), 'drive.provider_notify_failed');
}
