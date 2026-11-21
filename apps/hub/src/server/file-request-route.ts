import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ApiError, MEDIA_PATHS, type ApiErrorCode } from '@smarteverything/domain';
import { messageOf } from '@smarteverything/logging';
import type { DriveFileRequests, PublicFileRequest } from '../drive/sharing/file-requests';
import type { FileIntake, FileRequestIntake } from '../drive/sharing/file-request-intake';
import { fileRequestNoticeHtml, fileRequestPageHtml } from './file-request-page';
import { driveErrorCode } from './handlers/drive-errors';
import { remoteOf, sendError, sendJson } from './http';
import type { RawRoute } from './http-server';

const UPLOAD_PATH = `${MEDIA_PATHS.driveFileRequest}/files`;
const PROGRESS_PATH = `${UPLOAD_PATH}/:uploadId`;

export interface FileRequestRouteEnv {
  readonly requests: DriveFileRequests;
  readonly intake: FileRequestIntake;
}

type Params = Readonly<Record<string, string>>;

function headerOf(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function decoded(raw: string | undefined, what: string): string {
  try {
    return decodeURIComponent(raw ?? '');
  } catch (cause) {
    throw new ApiError('invalid_request', `The ${what} header is not valid: ${messageOf(cause)}`);
  }
}

function countOf(raw: string | undefined, what: string): number {
  const value = Number(raw);
  if (raw === undefined || !/^\d+$/u.test(raw) || !Number.isSafeInteger(value)) {
    throw new ApiError('invalid_request', `${what} must be a whole number of bytes.`);
  }
  return value;
}

function intakeOf(request: IncomingMessage): FileIntake {
  return {
    uploader: decoded(headerOf(request, 'x-uploader-name'), 'uploader name'),
    name: decoded(headerOf(request, 'x-file-name'), 'file name'),
  };
}

function pageHeaders(nonce: string): Record<string, string> {
  return {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-security-policy': [
      "default-src 'none'",
      "style-src 'unsafe-inline'",
      `script-src 'nonce-${nonce}'`,
      "connect-src 'self'",
      "form-action 'none'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
    ].join('; '),
    'x-frame-options': 'DENY',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  };
}

function sendPage(response: ServerResponse, status: number, html: string, nonce: string): void {
  response.writeHead(status, pageHeaders(nonce));
  response.end(html);
}

function apiErrorOf(cause: unknown): ApiError | null {
  if (cause instanceof ApiError) return cause;
  const code: ApiErrorCode | null = driveErrorCode(cause);
  if (code === null || code === 'internal' || !(cause instanceof Error)) return null;
  return new ApiError(code, cause.message);
}

async function refused<T>(response: ServerResponse, work: () => Promise<T>): Promise<T | null> {
  try {
    return await work();
  } catch (cause) {
    const error = apiErrorOf(cause);
    if (error === null) throw cause;
    sendError(response, error);
    return null;
  }
}

function openState(found: PublicFileRequest): string | null {
  if (found.state === 'closed') return 'This request is closed, so no more files are accepted.';
  if (found.state === 'expired') return 'This request has expired, so no more files are accepted.';
  return null;
}

async function page(
  env: FileRequestRouteEnv,
  request: IncomingMessage,
  response: ServerResponse,
  params: Params,
): Promise<void> {
  const nonce = randomBytes(16).toString('base64');
  try {
    const found = await env.requests.open(params['token'] ?? '', remoteOf(request));
    const reason = openState(found);
    sendPage(
      response,
      200,
      fileRequestPageHtml(
        {
          title: found.request.title,
          message: found.request.message,
          fromName: found.fromName,
          open: reason === null,
          reason,
        },
        nonce,
      ),
      nonce,
    );
  } catch (cause) {
    const error = apiErrorOf(cause);
    if (error === null) throw cause;
    const limited = error.code === 'rate_limited';
    sendPage(
      response,
      error.status,
      fileRequestNoticeHtml(
        limited ? 'Too many tries' : 'This link is no longer available',
        limited ? 'Wait a few minutes and try again.' : 'Ask the person who sent it for a new one.',
      ),
      nonce,
    );
  }
}

async function begin(
  env: FileRequestRouteEnv,
  request: IncomingMessage,
  response: ServerResponse,
  params: Params,
): Promise<void> {
  const progress = await refused(response, async () => {
    const found = await env.requests.receiving(params['token'] ?? '', remoteOf(request));
    const intake = intakeOf(request);
    return env.intake.begin(found, {
      ...intake,
      length: countOf(headerOf(request, 'x-upload-length'), 'The upload length'),
    });
  });
  if (progress === null) return;
  sendJson(response, 201, progress);
}

async function append(
  env: FileRequestRouteEnv,
  request: IncomingMessage,
  response: ServerResponse,
  params: Params,
): Promise<void> {
  const progress = await refused(response, async () => {
    const found = await env.requests.receiving(params['token'] ?? '', remoteOf(request));
    const chunks: AsyncIterable<Uint8Array> = request;
    return env.intake.append(found, {
      ...intakeOf(request),
      uploadId: params['uploadId'] ?? '',
      offset: countOf(headerOf(request, 'upload-offset'), 'The upload offset'),
      chunks,
    });
  });
  if (progress === null) return;
  sendJson(response, 200, progress);
}

async function head(
  env: FileRequestRouteEnv,
  request: IncomingMessage,
  response: ServerResponse,
  params: Params,
): Promise<void> {
  const progress = await refused(response, async () => {
    const found = await env.requests.receiving(params['token'] ?? '', remoteOf(request));
    return env.intake.status(found, params['uploadId'] ?? '');
  });
  if (progress === null) return;
  response.writeHead(200, {
    'Upload-Offset': String(progress.offset),
    'Upload-Length': String(progress.length),
    'Cache-Control': 'no-store',
  });
  response.end();
}

async function cancel(
  env: FileRequestRouteEnv,
  request: IncomingMessage,
  response: ServerResponse,
  params: Params,
): Promise<void> {
  const done = await refused(response, async () => {
    const found = await env.requests.receiving(params['token'] ?? '', remoteOf(request));
    await env.intake.cancel(found, params['uploadId'] ?? '');
    return true;
  });
  if (done === null) return;
  response.writeHead(204);
  response.end();
}

type Handler = (
  env: FileRequestRouteEnv,
  request: IncomingMessage,
  response: ServerResponse,
  params: Params,
) => Promise<void>;

const bound =
  (env: FileRequestRouteEnv, handler: Handler): RawRoute['handle'] =>
  (request, response, params) =>
    handler(env, request, response, params);

export function fileRequestRoutes(env: FileRequestRouteEnv): readonly RawRoute[] {
  return [
    { method: 'GET', path: MEDIA_PATHS.driveFileRequest, handle: bound(env, page) },
    { method: 'POST', path: UPLOAD_PATH, handle: bound(env, begin) },
    { method: 'PATCH', path: PROGRESS_PATH, handle: bound(env, append) },
    { method: 'HEAD', path: PROGRESS_PATH, handle: bound(env, head) },
    { method: 'DELETE', path: PROGRESS_PATH, handle: bound(env, cancel) },
  ];
}
