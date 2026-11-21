import {
  ApiError,
  type DriveFileRequest,
  type DriveFileRequestChange,
  type DriveFileRequestCreate,
  type DriveFileRequestUpload,
  type DriveItem,
} from '@smarteverything/domain';
import type { StoredDrive } from '../../store/repositories/drive-roots';
import type { Store } from '../../store/store';
import { storeUnit } from '../../store/host/unit';
import { canRead, canShare, itemAccess, type DriveActor } from '../access';
import type { FileRequestActor, FileRequestPage } from '../sharing/file-requests';

export const FILE_REQUEST_PAGE_SIZE = 50;

type FileRequestsStore = Pick<
  Store,
  'driveFileRequests' | 'driveItems' | 'driveRoots' | 'driveGrants' | 'profiles'
>;

export interface FileRequestInsert {
  readonly actor: FileRequestActor;
  readonly create: DriveFileRequestCreate;
  readonly tokenHash: string;
}

export type FileRequestFound =
  | {
      readonly kind: 'found';
      readonly request: DriveFileRequest;
      readonly fromName: string;
      readonly folder: DriveItem;
      readonly root: StoredDrive;
      readonly receiverProfileId: string;
    }
  | { readonly kind: 'missing' }
  | { readonly kind: 'unavailable' };

function missingRequest(): ApiError {
  return new ApiError('not_found', 'There is no such file request for this caller.');
}

function owned(store: FileRequestsStore, actor: DriveActor, requestId: string): DriveFileRequest {
  const request = store.driveFileRequests.find(requestId);
  if (request?.createdBy !== actor.profileId) throw missingRequest();
  return request;
}

function create(store: FileRequestsStore, input: FileRequestInsert): DriveFileRequest {
  const { actor } = input;
  const folder = store.driveItems.find(input.create.folderItemId, actor.profileId);
  const drive = folder === undefined ? undefined : store.driveRoots.find(folder.rootId);
  const access =
    folder === undefined || drive === undefined ? 'none' : itemAccess(store, actor, drive, folder);
  if (folder === undefined || drive === undefined || !canRead(access)) {
    throw new ApiError('not_found', 'There is no such folder for this caller.');
  }
  if (folder.kind !== 'folder') {
    throw new ApiError('invalid_request', 'A file request collects files into a folder.');
  }
  if (!canShare(access)) {
    throw new ApiError(
      'forbidden',
      'Only the person whose drive this is can ask for files into it.',
    );
  }
  if (!actor.linksAllowed) {
    throw new ApiError('forbidden', 'The owner has not allowed members to share links.');
  }
  return store.driveFileRequests.create({
    folderItemId: folder.id,
    createdBy: actor.profileId,
    title: input.create.title,
    message: input.create.message,
    tokenHash: input.tokenHash,
    expiresAt: input.create.expiresAt,
  });
}

function update(
  store: FileRequestsStore,
  input: {
    readonly actor: DriveActor;
    readonly requestId: string;
    readonly change: DriveFileRequestChange;
  },
): DriveFileRequest {
  return store.driveFileRequests.update(
    owned(store, input.actor, input.requestId).id,
    input.change,
  );
}

function close(
  store: FileRequestsStore,
  input: { readonly actor: DriveActor; readonly requestId: string },
): DriveFileRequest {
  return store.driveFileRequests.close(owned(store, input.actor, input.requestId).id);
}

function uploads(
  store: FileRequestsStore,
  input: {
    readonly actor: DriveActor;
    readonly requestId: string;
    readonly cursor: string | undefined;
  },
): FileRequestPage<DriveFileRequestUpload> {
  const request = owned(store, input.actor, input.requestId);
  const window = store.driveFileRequests.uploads(
    request.id,
    input.cursor ?? null,
    FILE_REQUEST_PAGE_SIZE,
  );
  return { items: window.uploads, next: window.next };
}

function byToken(
  store: FileRequestsStore,
  input: { readonly tokenHash: string },
): FileRequestFound {
  const request = store.driveFileRequests.byToken(input.tokenHash);
  if (request === undefined) return { kind: 'missing' };
  const folder = store.driveItems.find(request.folderItemId, null);
  const root = folder === undefined ? undefined : store.driveRoots.find(folder.rootId);
  const creator = store.profiles.list().find((profile) => profile.id === request.createdBy);
  if (folder?.kind !== 'folder' || root === undefined || creator === undefined) {
    return { kind: 'unavailable' };
  }
  if (!canShare(itemAccess(store, { profileId: creator.id }, root, folder))) {
    return { kind: 'unavailable' };
  }
  return {
    kind: 'found',
    request,
    fromName: creator.name,
    folder,
    root,
    receiverProfileId: root.ownerProfileId ?? creator.id,
  };
}

export const DRIVE_FILE_REQUEST_CREATE_UNIT = storeUnit(create);

export const DRIVE_FILE_REQUEST_UPDATE_UNIT = storeUnit(update);

export const DRIVE_FILE_REQUEST_CLOSE_UNIT = storeUnit(close);

export const DRIVE_FILE_REQUEST_UPLOADS_UNIT = storeUnit(uploads);

export const DRIVE_FILE_REQUEST_BY_TOKEN_UNIT = storeUnit(byToken);
