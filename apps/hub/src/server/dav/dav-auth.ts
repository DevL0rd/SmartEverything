import type { IncomingMessage, ServerResponse } from 'node:http';
import { ApiError, NODE_AI_TOKEN } from '@smarteverything/domain';
import { Logger, messageOf } from '@smarteverything/logging';
import type { ChangeActor, ChangeEnv } from '../../drive/changes';
import { DriveWriteError, type DriveWriteFailure } from '../../drive/intents';
import { DrivePathError, type DrivePathFailure } from '../../drive/paths';
import {
  DriveFreeSpaceError,
  DriveQuotaExceededError,
  type DriveWriteGuard,
} from '../../drive/quotas';
import type { DriveActor, DriveReadService } from '../../drive/service-read';
import type { Store } from '../../store/store';
import { authenticate, clientOf } from '../auth';
import type { DriveFileNodes } from '../drive-files';
import { actorOf } from '../handlers/drive-services';
import { bearerOf } from '../http';

const log = new Logger('hub.dav');

export const DAV_REALM = 'SmartEverything';

export interface DavDeps {
  readonly store: Store;
  readonly env: ChangeEnv;
  readonly read: Pick<DriveReadService, 'rootFor'>;
  readonly guard: DriveWriteGuard;
  readonly nodes: DriveFileNodes;
}

export interface DavExchange {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
}

export interface DavCaller {
  readonly actor: DriveActor;
  readonly change: ChangeActor;
}

export class DavError extends Error {
  override readonly name = 'DavError';

  constructor(
    readonly status: number,
    message: string,
    readonly condition: string | null = null,
  ) {
    super(message);
  }
}

function callerOf(actor: DriveActor, deviceId: string): DavCaller {
  return {
    actor,
    change: { actorProfileId: actor.profileId, via: 'mount', deviceId },
  };
}

export function authenticateDav(deps: DavDeps, request: IncomingMessage): DavCaller {
  const token = bearerOf(request);
  if (token === null) {
    throw new DavError(401, 'Send the device token or the computer token as a bearer token.');
  }
  if (NODE_AI_TOKEN.safeParse(token).success) {
    const node = deps.nodes.authenticate(token);
    return callerOf(deps.nodes.actorOf(node), node.device_id);
  }
  const client = clientOf(authenticate(deps.store, request, 'member', false));
  return callerOf(actorOf(deps.store, { kind: 'client', client }), client.id);
}

const PATH_STATUS: Readonly<Record<DrivePathFailure, number>> = {
  invalid: 400,
  escape: 403,
  missing: 404,
  changed: 409,
  'not-directory': 409,
};

const WRITE_STATUS: Readonly<Record<DriveWriteFailure, number>> = {
  'read-only': 403,
  exists: 409,
  missing: 409,
  corrupt: 500,
  'no-physical-root': 409,
};

const INSUFFICIENT_STORAGE = 507;

interface Failure {
  readonly status: number;
  readonly message: string;
  readonly condition: string | null;
}

function failureOf(cause: unknown): Failure | null {
  if (cause instanceof DavError) {
    return { status: cause.status, message: cause.message, condition: cause.condition };
  }
  const status = statusOf(cause);
  return status === null ? null : { status, message: messageOf(cause), condition: null };
}

function statusOf(cause: unknown): number | null {
  if (cause instanceof ApiError) return cause.status;
  if (cause instanceof DrivePathError) return PATH_STATUS[cause.failure];
  if (cause instanceof DriveWriteError) return WRITE_STATUS[cause.failure];
  if (cause instanceof DriveQuotaExceededError || cause instanceof DriveFreeSpaceError) {
    return INSUFFICIENT_STORAGE;
  }
  return null;
}

function failureBody(failure: Failure): { readonly type: string; readonly text: string } {
  if (failure.condition === null) {
    return { type: 'text/plain; charset=utf-8', text: failure.message };
  }
  return {
    type: 'application/xml; charset=utf-8',
    text: `<?xml version="1.0" encoding="utf-8"?><D:error xmlns:D="DAV:"><D:${failure.condition}/></D:error>`,
  };
}

function sendFailure(response: ServerResponse, failure: Failure): void {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  const { type, text } = failureBody(failure);
  response.writeHead(failure.status, {
    'content-type': type,
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
    ...(failure.status === 401 ? { 'www-authenticate': `Bearer realm="${DAV_REALM}"` } : {}),
  });
  response.end(text);
}

export async function guarded(
  { request, response }: DavExchange,
  work: () => Promise<void>,
): Promise<void> {
  try {
    await work();
  } catch (cause) {
    const failure = failureOf(cause);
    if (failure === null) throw cause;
    log.info('dav.refused', { method: request.method ?? '', status: failure.status });
    sendFailure(response, failure);
  }
}
