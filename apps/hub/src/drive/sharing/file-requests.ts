import { randomBytes } from 'node:crypto';
import {
  ApiError,
  DRIVE_FILE_REQUEST_CREATED,
  MEDIA_PATHS,
  buildPath,
  type DriveFileRequest,
  type DriveFileRequestChange,
  type DriveFileRequestCreate,
  type DriveFileRequestCreated,
  type DriveFileRequestUpload,
  type DriveItem,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { StoredDrive } from '../../store/repositories/drive-roots';
import type { Store } from '../../store/store';
import { canRead, canShare, itemAccess, type DriveActor } from '../access';
import { GuessLimiter, hashToken, type ShareOrigin } from '../shares';

const log = new Logger('hub.drive');

export const FILE_REQUEST_PAGE_SIZE = 50;

const TOKEN_BYTES = 32;
const TOKEN = z.string().regex(/^[A-Za-z0-9_-]{43}$/u);

export interface FileRequestActor extends DriveActor {
  readonly linksAllowed: boolean;
}

export type FileRequestsStore = Pick<
  Store,
  'driveFileRequests' | 'driveItems' | 'driveRoots' | 'driveGrants' | 'profiles'
>;

export interface FileRequestsEnv {
  readonly store: FileRequestsStore;
  readonly origin: () => ShareOrigin;
  readonly now: () => Date;
}

export interface FileRequestPage<T> {
  readonly items: readonly T[];
  readonly next: string | null;
}

export type FileRequestState = 'open' | 'closed' | 'expired';

export interface PublicFileRequest {
  readonly request: DriveFileRequest;
  readonly state: FileRequestState;
  readonly fromName: string;
  readonly folder: DriveItem;
  readonly root: StoredDrive;
  readonly receiverProfileId: string;
}

function unavailable(): ApiError {
  return new ApiError('not_found', 'This link is no longer available.');
}

function missingRequest(): ApiError {
  return new ApiError('not_found', 'There is no such file request for this caller.');
}

export class DriveFileRequests {
  private readonly limiter: GuessLimiter;

  constructor(private readonly env: FileRequestsEnv) {
    this.limiter = new GuessLimiter(env.now);
  }

  create(actor: FileRequestActor, input: DriveFileRequestCreate): DriveFileRequestCreated {
    const { store } = this.env;
    const folder = store.driveItems.find(input.folderItemId, actor.profileId);
    const drive = folder === undefined ? undefined : store.driveRoots.find(folder.rootId);
    if (folder === undefined || drive === undefined || !canRead(this.accessTo(actor, folder))) {
      throw new ApiError('not_found', 'There is no such folder for this caller.');
    }
    if (folder.kind !== 'folder') {
      throw new ApiError('invalid_request', 'A file request collects files into a folder.');
    }
    if (!canShare(this.accessTo(actor, folder))) {
      throw new ApiError(
        'forbidden',
        'Only the person whose drive this is can ask for files into it.',
      );
    }
    if (!actor.linksAllowed) {
      throw new ApiError('forbidden', 'The owner has not allowed members to share links.');
    }
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const request = store.driveFileRequests.create({
      folderItemId: folder.id,
      createdBy: actor.profileId,
      title: input.title,
      message: input.message,
      tokenHash: hashToken(token),
      expiresAt: input.expiresAt,
    });
    const origin = this.env.origin();
    log.info('drive_file_request.created', {
      requestId: request.id,
      folderItemId: folder.id,
      public: origin.public,
      by: actor.profileId,
    });
    return DRIVE_FILE_REQUEST_CREATED.parse({
      request,
      url: `${origin.url.replace(/\/+$/u, '')}${buildPath(MEDIA_PATHS.driveFileRequest, { token })}`,
      public: origin.public,
    });
  }

  list(
    actor: DriveActor,
    folderItemId: string | undefined,
    cursor: string | undefined,
  ): FileRequestPage<DriveFileRequest> {
    const window = this.env.store.driveFileRequests.madeBy(
      actor.profileId,
      folderItemId ?? null,
      cursor ?? null,
      FILE_REQUEST_PAGE_SIZE,
    );
    return { items: window.requests, next: window.next };
  }

  update(actor: DriveActor, requestId: string, change: DriveFileRequestChange): DriveFileRequest {
    const request = this.owned(actor, requestId);
    return this.env.store.driveFileRequests.update(request.id, change);
  }

  close(actor: DriveActor, requestId: string): DriveFileRequest {
    const request = this.owned(actor, requestId);
    const closed = this.env.store.driveFileRequests.close(request.id);
    log.info('drive_file_request.closed', { requestId: request.id, by: actor.profileId });
    return closed;
  }

  uploads(
    actor: DriveActor,
    requestId: string,
    cursor: string | undefined,
  ): FileRequestPage<DriveFileRequestUpload> {
    const request = this.owned(actor, requestId);
    const window = this.env.store.driveFileRequests.uploads(
      request.id,
      cursor ?? null,
      FILE_REQUEST_PAGE_SIZE,
    );
    return { items: window.uploads, next: window.next };
  }

  open(token: string, remote: string): PublicFileRequest {
    this.limiter.check(remote);
    const parsed = TOKEN.safeParse(token);
    const request = parsed.success
      ? this.env.store.driveFileRequests.byToken(hashToken(parsed.data))
      : undefined;
    if (request === undefined) {
      this.limiter.fail(remote);
      log.warn('drive_file_request.guess_failed', { remote });
      throw unavailable();
    }
    return this.publicOf(request);
  }

  receiving(token: string, remote: string): PublicFileRequest {
    const found = this.open(token, remote);
    if (found.state === 'closed') {
      throw new ApiError('link_expired', 'This request is closed; no more files are accepted.');
    }
    if (found.state === 'expired') {
      throw new ApiError('link_expired', 'This request has expired; no more files are accepted.');
    }
    return found;
  }

  private publicOf(request: DriveFileRequest): PublicFileRequest {
    const { store } = this.env;
    const folder = store.driveItems.find(request.folderItemId, null);
    const root = folder === undefined ? undefined : store.driveRoots.find(folder.rootId);
    const creator = store.profiles.list().find((profile) => profile.id === request.createdBy);
    if (folder?.kind !== 'folder' || root === undefined || creator === undefined) {
      throw unavailable();
    }
    if (!canShare(itemAccess(store, { profileId: creator.id }, root, folder))) {
      throw unavailable();
    }
    return {
      request,
      state: this.stateOf(request),
      fromName: creator.name,
      folder,
      root,
      receiverProfileId: root.ownerProfileId ?? creator.id,
    };
  }

  private stateOf(request: DriveFileRequest): FileRequestState {
    if (request.closedAt !== null) return 'closed';
    const lapsed =
      request.expiresAt !== null && Date.parse(request.expiresAt) <= this.env.now().getTime();
    return lapsed ? 'expired' : 'open';
  }

  private owned(actor: DriveActor, requestId: string): DriveFileRequest {
    const request = this.env.store.driveFileRequests.find(requestId);
    if (request?.createdBy !== actor.profileId) throw missingRequest();
    return request;
  }

  private accessTo(actor: DriveActor, item: DriveItem): ReturnType<typeof itemAccess> {
    const { store } = this.env;
    return itemAccess(store, actor, store.driveRoots.byId(item.rootId), item);
  }
}
