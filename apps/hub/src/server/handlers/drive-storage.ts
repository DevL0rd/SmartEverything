import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { readDriveUsage } from '../../drive/usage';
import type { Store } from '../../store/store';
import { DONE_REPLY, bound, type Routes } from '../router';
import { refusing } from './drive-errors';
import { driveVersionLink } from '../drive-version-file';
import { actorOf, callerOf, usageViewerOf, type DriveServices } from './drive-services';

type DriveShareRoute =
  | 'listVersions'
  | 'listItemActivity'
  | 'listDriveActivity'
  | 'restoreVersion'
  | 'listShares'
  | 'createShare'
  | 'revokeShare'
  | 'unlockShare';

type DriveUpkeepRoute =
  | 'readUsage'
  | 'listQuotas'
  | 'setQuota'
  | 'readHealth'
  | 'startScrub'
  | 'reportBackup'
  | 'readBackupStatus';

type DriveSyncRoute = 'listConflicts' | 'resolveConflict' | 'versionLink';

function driveShareRoutes(services: DriveServices): Routes<DriveShareRoute> {
  const { write, shares } = services;
  return {
    listVersions: bound(E.listVersions, ({ params, query, caller }) =>
      refusing(() =>
        services.read.itemVersions(actorOf(caller), {
          itemId: params.itemId,
          cursor: query.cursor,
        }),
      ),
    ),
    listDriveActivity: bound(E.listDriveActivity, ({ query, caller }) =>
      refusing(() => services.read.readActivity(actorOf(caller), query)),
    ),
    listItemActivity: bound(E.listItemActivity, ({ params, query, caller }) =>
      refusing(() =>
        services.read.itemActivity(actorOf(caller), {
          itemId: params.itemId,
          cursor: query.cursor,
        }),
      ),
    ),
    restoreVersion: bound(E.restoreVersion, ({ params, caller }) =>
      refusing(() => write.restoreVersion(callerOf(caller), params.itemId, params.versionId)),
    ),
    listShares: bound(E.listShares, ({ query, caller }) =>
      refusing(() => services.listings.shares(actorOf(caller), query)),
    ),
    createShare: bound(E.createShare, ({ body, caller }) =>
      refusing(() => write.createShare(callerOf(caller), body)),
    ),
    revokeShare: bound(E.revokeShare, ({ params, caller }) =>
      refusing(async () => {
        await write.revokeShare(callerOf(caller), params.shareId);
        return DONE_REPLY;
      }),
    ),
    unlockShare: bound(E.unlockShare, ({ params, body }) =>
      refusing(async () => {
        const access = await shares.open(params.token);
        await shares.verifyPassword(access, body.password);
        await shares.record(access, 'open');
        return shares.link(access, params.token, access.entryId);
      }),
    ),
  };
}

function driveUpkeepRoutes(store: Store, services: DriveServices): Routes<DriveUpkeepRoute> {
  const { write } = services;
  return {
    readUsage: bound(E.readUsage, ({ caller }) =>
      readDriveUsage(store.driveQuotas, usageViewerOf(caller)),
    ),
    listQuotas: bound(E.listQuotas, () => store.host.call('driveQuotas', 'all')),
    setQuota: bound(E.setQuota, ({ body, caller }) =>
      refusing(async () => {
        await write.setQuota(callerOf(caller), body);
        return DONE_REPLY;
      }),
    ),
    readHealth: bound(E.readHealth, ({ caller }) => services.health.read(actorOf(caller))),
    startScrub: bound(E.startScrub, ({ caller }) =>
      refusing(() => write.startScrub(callerOf(caller))),
    ),
    reportBackup: bound(E.reportBackup, ({ body, caller }) =>
      refusing(() => write.reportBackup(callerOf(caller), body)),
    ),
    readBackupStatus: bound(E.readBackupStatus, () => services.backups.status()),
  };
}

function driveSyncRoutes(store: Store, services: DriveServices): Routes<DriveSyncRoute> {
  const { write } = services;
  return {
    listConflicts: bound(E.listConflicts, ({ query, caller }) =>
      refusing(() => services.listings.conflicts(actorOf(caller), query)),
    ),
    resolveConflict: bound(E.resolveConflict, ({ body, caller }) =>
      refusing(() => write.resolveConflict(callerOf(caller), body)),
    ),
    versionLink: bound(E.versionLink, ({ params, caller }) =>
      refusing(() =>
        driveVersionLink(
          { files: services.files, versions: store.driveVersions },
          actorOf(caller),
          params,
        ),
      ),
    ),
  };
}

export function driveStorageRoutes(
  store: Store,
  services: DriveServices,
): Routes<DriveShareRoute | DriveUpkeepRoute | DriveSyncRoute> {
  return {
    ...driveShareRoutes(services),
    ...driveUpkeepRoutes(store, services),
    ...driveSyncRoutes(store, services),
  };
}
