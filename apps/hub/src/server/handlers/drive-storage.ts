import {
  API_ENDPOINTS as E,
  ApiError,
  type DriveFeedRow,
  type DriveVersion,
} from '@smarteverything/domain';
import type { DriveActor } from '../../drive/access';
import { DRIVE_PAGE_SIZE } from '../../drive/service-read';
import { readDriveUsage } from '../../drive/usage';
import type { Store } from '../../store/store';
import { DONE_REPLY, bound, type Routes } from '../router';
import { refusing } from './drive-errors';
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

type DriveSyncRoute = 'listConflicts' | 'resolveConflict';

function revCursor(cursor: string | undefined): number | null {
  if (cursor === undefined) return null;
  const rev = Number(cursor);
  if (!Number.isSafeInteger(rev) || rev <= 0) {
    throw new ApiError('invalid_request', 'The cursor is not one this list gave out.');
  }
  return rev;
}

interface VersionPageRequest {
  readonly itemId: string;
  readonly cursor: string | undefined;
}

function versionsPage(
  store: Store,
  services: DriveServices,
  actor: DriveActor,
  request: VersionPageRequest,
): { readonly items: readonly DriveVersion[]; readonly next: string | null } {
  services.read.readItem(actor, request.itemId);
  const window = store.driveVersions.forItem(
    request.itemId,
    revCursor(request.cursor),
    DRIVE_PAGE_SIZE,
  );
  return {
    items: window.versions,
    next: window.next === null ? null : String(window.next),
  };
}

function activityPage(
  store: Store,
  services: DriveServices,
  actor: DriveActor,
  request: VersionPageRequest,
): { readonly items: readonly DriveFeedRow[]; readonly next: string | null } {
  services.read.readItem(actor, request.itemId);
  const window = store.driveFeed.recentOfItem(
    request.itemId,
    revCursor(request.cursor),
    DRIVE_PAGE_SIZE,
  );
  return {
    items: window.rows,
    next: window.next === null ? null : String(window.next),
  };
}

function driveShareRoutes(store: Store, services: DriveServices): Routes<DriveShareRoute> {
  const { write, shares } = services;
  return {
    listVersions: bound(E.listVersions, ({ params, query, caller }) =>
      refusing(() =>
        versionsPage(store, services, actorOf(store, caller), {
          itemId: params.itemId,
          cursor: query.cursor,
        }),
      ),
    ),
    listDriveActivity: bound(E.listDriveActivity, ({ query, caller }) =>
      refusing(() => services.read.readActivity(actorOf(store, caller), query)),
    ),
    listItemActivity: bound(E.listItemActivity, ({ params, query, caller }) =>
      refusing(() =>
        activityPage(store, services, actorOf(store, caller), {
          itemId: params.itemId,
          cursor: query.cursor,
        }),
      ),
    ),
    restoreVersion: bound(E.restoreVersion, ({ params, caller }) =>
      refusing(() =>
        write.restoreVersion(callerOf(store, caller), params.itemId, params.versionId),
      ),
    ),
    listShares: bound(E.listShares, ({ query, caller }) =>
      refusing(() => services.listings.shares(actorOf(store, caller), query)),
    ),
    createShare: bound(E.createShare, ({ body, caller }) =>
      refusing(() => write.createShare(callerOf(store, caller), body)),
    ),
    revokeShare: bound(E.revokeShare, ({ params, caller }) =>
      refusing(() => {
        write.revokeShare(callerOf(store, caller), params.shareId);
        return DONE_REPLY;
      }),
    ),
    unlockShare: bound(E.unlockShare, ({ params, body }) =>
      refusing(async () => {
        const access = shares.open(params.token);
        await shares.verifyPassword(access, body.password);
        shares.record(access, 'open');
        return shares.link(access, params.token, access.item.id);
      }),
    ),
  };
}

function driveUpkeepRoutes(store: Store, services: DriveServices): Routes<DriveUpkeepRoute> {
  const { write } = services;
  return {
    readUsage: bound(E.readUsage, ({ caller }) =>
      readDriveUsage(store.driveQuotas, usageViewerOf(store, caller)),
    ),
    listQuotas: bound(E.listQuotas, () => store.driveQuotas.all()),
    setQuota: bound(E.setQuota, ({ body, caller }) =>
      refusing(() => {
        write.setQuota(callerOf(store, caller), body);
        return DONE_REPLY;
      }),
    ),
    readHealth: bound(E.readHealth, ({ caller }) => services.health.read(actorOf(store, caller))),
    startScrub: bound(E.startScrub, ({ caller }) =>
      refusing(() => write.startScrub(callerOf(store, caller))),
    ),
    reportBackup: bound(E.reportBackup, ({ body, caller }) =>
      refusing(() => write.reportBackup(callerOf(store, caller), body)),
    ),
    readBackupStatus: bound(E.readBackupStatus, () => services.backups.status()),
  };
}

function driveSyncRoutes(store: Store, services: DriveServices): Routes<DriveSyncRoute> {
  const { write } = services;
  return {
    listConflicts: bound(E.listConflicts, ({ query, caller }) =>
      refusing(() => services.listings.conflicts(actorOf(store, caller), query)),
    ),
    resolveConflict: bound(E.resolveConflict, ({ body, caller }) =>
      refusing(() => write.resolveConflict(callerOf(store, caller), body)),
    ),
  };
}

export function driveStorageRoutes(
  store: Store,
  services: DriveServices,
): Routes<DriveShareRoute | DriveUpkeepRoute | DriveSyncRoute> {
  return {
    ...driveShareRoutes(store, services),
    ...driveUpkeepRoutes(store, services),
    ...driveSyncRoutes(store, services),
  };
}
