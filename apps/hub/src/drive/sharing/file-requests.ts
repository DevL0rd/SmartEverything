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
import type { DriveActor } from '../access';
import { GuessLimiter, hashToken, type ShareOrigin } from '../shares';
import { FILE_REQUEST_PAGE_SIZE } from '../units/file-requests';

const log = new Logger('hub.drive');

const TOKEN_BYTES = 32;
const TOKEN = z.string().regex(/^[A-Za-z0-9_-]{43}$/u);

export interface FileRequestActor extends DriveActor {
  readonly linksAllowed: boolean;
}

export interface FileRequestsEnv {
  readonly store: Pick<Store, 'host'>;
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

export class DriveFileRequests {
  private readonly limiter: GuessLimiter;

  constructor(private readonly env: FileRequestsEnv) {
    this.limiter = new GuessLimiter(env.now);
  }

  async create(
    actor: FileRequestActor,
    input: DriveFileRequestCreate,
  ): Promise<DriveFileRequestCreated> {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const request = await this.env.store.host.write('driveFileRequestCreate', {
      actor,
      create: input,
      tokenHash: hashToken(token),
    });
    const origin = this.env.origin();
    log.info('drive_file_request.created', {
      requestId: request.id,
      folderItemId: request.folderItemId,
      public: origin.public,
      by: actor.profileId,
    });
    return DRIVE_FILE_REQUEST_CREATED.parse({
      request,
      url: `${origin.url.replace(/\/+$/u, '')}${buildPath(MEDIA_PATHS.driveFileRequest, { token })}`,
      public: origin.public,
    });
  }

  async list(
    actor: DriveActor,
    folderItemId: string | undefined,
    cursor: string | undefined,
  ): Promise<FileRequestPage<DriveFileRequest>> {
    const window = await this.env.store.host.call(
      'driveFileRequests',
      'madeBy',
      actor.profileId,
      folderItemId ?? null,
      cursor ?? null,
      FILE_REQUEST_PAGE_SIZE,
    );
    return { items: window.requests, next: window.next };
  }

  update(
    actor: DriveActor,
    requestId: string,
    change: DriveFileRequestChange,
  ): Promise<DriveFileRequest> {
    return this.env.store.host.write('driveFileRequestUpdate', { actor, requestId, change });
  }

  async close(actor: DriveActor, requestId: string): Promise<DriveFileRequest> {
    const closed = await this.env.store.host.write('driveFileRequestClose', { actor, requestId });
    log.info('drive_file_request.closed', { requestId: closed.id, by: actor.profileId });
    return closed;
  }

  uploads(
    actor: DriveActor,
    requestId: string,
    cursor: string | undefined,
  ): Promise<FileRequestPage<DriveFileRequestUpload>> {
    return this.env.store.host.read('driveFileRequestUploads', { actor, requestId, cursor });
  }

  async open(token: string, remote: string): Promise<PublicFileRequest> {
    this.limiter.check(remote);
    const parsed = TOKEN.safeParse(token);
    const found = parsed.success
      ? await this.env.store.host.read('driveFileRequestByToken', {
          tokenHash: hashToken(parsed.data),
        })
      : ({ kind: 'missing' } as const);
    if (found.kind === 'missing') {
      this.limiter.fail(remote);
      log.warn('drive_file_request.guess_failed', { remote });
      throw unavailable();
    }
    if (found.kind === 'unavailable') throw unavailable();
    const { kind: _kind, ...rest } = found;
    return { ...rest, state: this.stateOf(found.request) };
  }

  async receiving(token: string, remote: string): Promise<PublicFileRequest> {
    const found = await this.open(token, remote);
    if (found.state === 'closed') {
      throw new ApiError('link_expired', 'This request is closed; no more files are accepted.');
    }
    if (found.state === 'expired') {
      throw new ApiError('link_expired', 'This request has expired; no more files are accepted.');
    }
    return found;
  }

  private stateOf(request: DriveFileRequest): FileRequestState {
    if (request.closedAt !== null) return 'closed';
    const lapsed =
      request.expiresAt !== null && Date.parse(request.expiresAt) <= this.env.now().getTime();
    return lapsed ? 'expired' : 'open';
  }
}
