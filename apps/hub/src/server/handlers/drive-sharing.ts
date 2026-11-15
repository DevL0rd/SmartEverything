import { API_ENDPOINTS as E } from '@smarteverything/domain';
import type { DriveAccessRequests } from '../../drive/sharing/access-requests';
import type { DriveFileRequests } from '../../drive/sharing/file-requests';
import type { DriveShares } from '../../drive/shares';
import type { DriveLocks } from '../../drive/sharing/locks';
import type { DriveTransfers } from '../../drive/sharing/transfers';
import type { Store } from '../../store/store';
import { bound, type Routes } from '../router';
import { refusing } from './drive-errors';
import { actorOf, callerOf } from './drive-services';

export interface DriveSharingServices {
  readonly accessRequests: DriveAccessRequests;
  readonly fileRequests: DriveFileRequests;
  readonly transfers: DriveTransfers;
  readonly locks: DriveLocks;
  readonly shares: Pick<DriveShares, 'linksAllowed'>;
}

type AccessRoute =
  | 'openItem'
  | 'setItemLock'
  | 'requestDriveAccess'
  | 'listDriveAccessRequests'
  | 'answerDriveAccessRequest';

type FileRequestRoute =
  | 'createFileRequest'
  | 'listFileRequests'
  | 'updateFileRequest'
  | 'closeFileRequest'
  | 'listFileRequestUploads';

type TransferRoute = 'offerTransfer' | 'listTransfers' | 'answerTransfer' | 'cancelTransfer';

function accessRoutes(
  store: Store,
  { accessRequests, locks }: DriveSharingServices,
): Routes<AccessRoute> {
  return {
    openItem: bound(E.openItem, ({ params, caller }) =>
      refusing(() => accessRequests.open(actorOf(store, caller), params.itemId)),
    ),
    setItemLock: bound(E.setItemLock, ({ body, caller }) =>
      refusing(() => locks.set(actorOf(store, caller), body)),
    ),
    requestDriveAccess: bound(E.requestDriveAccess, ({ body, caller }) =>
      refusing(() => accessRequests.request(actorOf(store, caller), body)),
    ),
    listDriveAccessRequests: bound(E.listDriveAccessRequests, ({ query, caller }) =>
      refusing(() => accessRequests.list(actorOf(store, caller), query.box, query.cursor)),
    ),
    answerDriveAccessRequest: bound(E.answerDriveAccessRequest, ({ params, body, caller }) =>
      refusing(() => accessRequests.answer(actorOf(store, caller), params.requestId, body)),
    ),
  };
}

function fileRequestApiRoutes(
  store: Store,
  { fileRequests, shares }: DriveSharingServices,
): Routes<FileRequestRoute> {
  return {
    createFileRequest: bound(E.createFileRequest, ({ body, caller }) =>
      refusing(() => {
        const person = callerOf(store, caller);
        return fileRequests.create(
          {
            profileId: person.profileId,
            linksAllowed: shares.linksAllowed(person),
          },
          body,
        );
      }),
    ),
    listFileRequests: bound(E.listFileRequests, ({ query, caller }) =>
      refusing(() => fileRequests.list(actorOf(store, caller), query.folderItemId, query.cursor)),
    ),
    updateFileRequest: bound(E.updateFileRequest, ({ params, body, caller }) =>
      refusing(() => fileRequests.update(actorOf(store, caller), params.fileRequestId, body)),
    ),
    closeFileRequest: bound(E.closeFileRequest, ({ params, caller }) =>
      refusing(() => fileRequests.close(actorOf(store, caller), params.fileRequestId)),
    ),
    listFileRequestUploads: bound(E.listFileRequestUploads, ({ params, query, caller }) =>
      refusing(() =>
        fileRequests.uploads(actorOf(store, caller), params.fileRequestId, query.cursor),
      ),
    ),
  };
}

function transferRoutes(store: Store, { transfers }: DriveSharingServices): Routes<TransferRoute> {
  return {
    offerTransfer: bound(E.offerTransfer, ({ body, caller }) =>
      refusing(() => transfers.offer(actorOf(store, caller), body)),
    ),
    listTransfers: bound(E.listTransfers, ({ query, caller }) =>
      refusing(() => transfers.list(actorOf(store, caller), query.cursor)),
    ),
    answerTransfer: bound(E.answerTransfer, ({ params, body, caller }) =>
      refusing(() => transfers.answer(actorOf(store, caller), params.transferId, body)),
    ),
    cancelTransfer: bound(E.cancelTransfer, ({ params, caller }) =>
      refusing(() => transfers.cancel(actorOf(store, caller), params.transferId)),
    ),
  };
}

export function driveSharingRoutes(
  store: Store,
  services: DriveSharingServices,
): ReturnType<typeof accessRoutes> &
  ReturnType<typeof fileRequestApiRoutes> &
  ReturnType<typeof transferRoutes> {
  return {
    ...accessRoutes(store, services),
    ...fileRequestApiRoutes(store, services),
    ...transferRoutes(store, services),
  };
}
