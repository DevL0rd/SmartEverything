import type { FileHandle } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  ApiError,
  DRIVE_UPLOAD_METADATA,
  type DriveUpload,
  type DriveUploadTarget,
} from '@smarteverything/domain';
import { z } from 'zod';
import { fsCode } from '../fs-code';
import type { ChangeActor } from './changes';
import { DriveWriteError, TMP_DIRECTORY, type DriveWriteFailure } from './intents';
import { DriveFreeSpaceError, DriveQuotaExceededError } from './quotas';
import type { DriveActor } from './access';

export const UPLOADS_PATH = '/drive/uploads';
export const TUS_VERSION = '1.0.0';
export const TUS_EXTENSIONS = 'creation,checksum,termination,expiration';

export const DAY_MS = 86_400_000;
export const OFFSET_STREAM = 'application/offset+octet-stream';
const NO_SPACE = 507;

export interface TusCaller extends DriveActor {
  readonly clientId: string | null;
  readonly nodeId: string | null;
}

export class TusError extends Error {
  override readonly name = 'TusError';

  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface Reply {
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
}

const WRITE_STATUS: Readonly<Record<DriveWriteFailure, number>> = {
  exists: 409,
  missing: 404,
  corrupt: 500,
};

export function absent(): TusError {
  return new TusError(404, 'There is no such upload for this credential.');
}

function decodeMetadata(header: string | undefined): Record<string, string> {
  const pairs = (header ?? '')
    .split(',')
    .map((pair) => pair.trim())
    .filter((pair) => pair !== '')
    .map((pair): [string, string] => {
      const [key = '', value = ''] = pair.split(' ');
      return [key, Buffer.from(value, 'base64').toString('utf8')];
    });
  return Object.fromEntries(pairs);
}

export function targetOf(request: IncomingMessage): {
  target: DriveUploadTarget;
  name: string;
  sha256: string | null;
} {
  const parsed = DRIVE_UPLOAD_METADATA.safeParse(
    decodeMetadata(headerOf(request, 'upload-metadata')),
  );
  if (!parsed.success) {
    throw new TusError(
      400,
      'Upload-Metadata must match the shared drive upload metadata contract.',
    );
  }
  const meta = parsed.data;
  return {
    target:
      meta.targetKind === 'folder'
        ? { kind: 'folder', folderId: meta.folderId }
        : { kind: 'item', itemId: meta.itemId, baseRev: Number(meta.baseRev) },
    name: meta.filename,
    sha256: meta.sha256 ?? null,
  };
}

export function headerOf(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export function lengthOf(request: IncomingMessage): number {
  const raw = headerOf(request, 'upload-length');
  if (headerOf(request, 'upload-defer-length') !== undefined || raw === undefined) {
    throw new TusError(400, 'Upload-Length is required; deferred lengths are not supported.');
  }
  const length = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(length)) {
    throw new TusError(400, 'Upload-Length must be a whole number of bytes.');
  }
  return length;
}

export function checksumOf(request: IncomingMessage): string | undefined {
  const raw = headerOf(request, 'upload-checksum');
  if (raw === undefined) {
    return undefined;
  }
  const [algorithm, value] = raw.split(' ');
  if (algorithm !== 'sha256' || value === undefined || value === '') {
    throw new TusError(400, 'Only the sha256 checksum algorithm is supported.');
  }
  return Buffer.from(value, 'base64').toString('hex');
}

export function tmpPath(uploadId: string): string {
  return `${TMP_DIRECTORY}/${uploadId}`;
}

export function expiresHeader(upload: DriveUpload): string {
  return new Date(upload.expiresAt).toUTCString();
}

export function refusalOf(cause: unknown): TusError | null {
  if (cause instanceof TusError) {
    return cause;
  }
  if (cause instanceof ApiError) {
    return new TusError(cause.status, cause.message);
  }
  if (cause instanceof DriveQuotaExceededError) {
    return new TusError(413, cause.message);
  }
  if (cause instanceof DriveFreeSpaceError || fsCode(cause) === 'ENOSPC') {
    return new TusError(NO_SPACE, 'The disk has no space left for this upload.');
  }
  if (cause instanceof DriveWriteError) {
    return new TusError(WRITE_STATUS[cause.failure], cause.message);
  }
  return null;
}

export function freeNameAt(name: string, attempt: number): string {
  if (attempt === 1) {
    return name;
  }
  const extension = extname(name);
  return `${basename(name, extension)} (${String(attempt)})${extension}`;
}

export function actorOf(upload: DriveUpload): ChangeActor {
  return upload.nodeId === null
    ? { actorProfileId: upload.profileId, via: 'app', deviceId: null }
    : { actorProfileId: upload.profileId, via: 'mount', deviceId: upload.nodeId };
}

export function idOf(url: string): string | null | undefined {
  const path = url.split('?')[0] ?? '';
  if (path === UPLOADS_PATH || path === `${UPLOADS_PATH}/`) {
    return null;
  }
  const id = path.startsWith(`${UPLOADS_PATH}/`) ? path.slice(UPLOADS_PATH.length + 1) : '';
  return z.uuid().safeParse(id).success ? id : undefined;
}

export function send(response: ServerResponse, reply: Reply): void {
  response.writeHead(reply.status, {
    'Tus-Resumable': TUS_VERSION,
    ...(reply.body === undefined ? {} : { 'Content-Type': 'text/plain; charset=utf-8' }),
    ...reply.headers,
  });
  response.end(reply.body);
}

export function completedHeaders(
  result: { readonly itemId: string; readonly name: string } | undefined,
): Readonly<Record<string, string>> {
  if (result === undefined) {
    throw new TusError(410, 'The completed upload has no item receipt. Start a fresh upload.');
  }
  return { 'Upload-Item-Id': result.itemId, 'Upload-Item-Name': encodeURIComponent(result.name) };
}

export type PositionalWrite = (
  handle: FileHandle,
  chunk: Uint8Array,
  position: number,
) => Promise<void>;

export async function writeAtPosition(
  handle: FileHandle,
  chunk: Uint8Array,
  position: number,
): Promise<void> {
  await handle.write(chunk, 0, chunk.byteLength, position);
}
