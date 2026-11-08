import type { IncomingMessage, ServerResponse } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { ApiError, MEDIA_PATHS, buildPath, type DriveItem } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { DrivePathError, openResolved, resolveInRoot } from '../drive/paths';
import { DRIVE_PAGE_SIZE } from '../drive/service-read';
import type { DriveShares, ShareAccess } from '../drive/shares';
import type { DerivedLayout } from '../photos/pipeline/derived-paths';
import { outsideCopy } from '../photos/pipeline/strip-location';
import { serveBytes, type ByteSource } from './file-serve';
import { PUBLIC_BODY_LIMIT, parseJsonBody, readBody, sendJson } from './http';
import type { RawRoute } from './http-server';

const log = new Logger('hub.drive');

type FileItem = Exclude<DriveItem, { readonly kind: 'folder' }>;

const PASSWORD_BODY = z.strictObject({ password: z.string().min(1) });
const PAGE_QUERY = z.object({ after: z.string().min(1).optional() });

const STRIPPED_MIME: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  tiff: 'image/tiff',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
};

export interface ShareRouteEnv {
  readonly shares: DriveShares;
  readonly layout: DerivedLayout;
  readonly removeLocationOutside: (sharedBy: string) => boolean;
}

interface Exchange {
  readonly env: ShareRouteEnv;
  readonly access: ShareAccess;
  readonly token: string;
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
}

function pathFailure(cause: unknown): never {
  if (cause instanceof DrivePathError) {
    log.warn('drive_share.unreadable', { failure: cause.failure });
    throw new ApiError('not_found', 'This link is no longer available.');
  }
  throw cause;
}

function startsAtBeginning(request: IncomingMessage): boolean {
  const range = request.headers.range;
  return range === undefined || range.startsWith('bytes=0-');
}

function recordUse(exchange: Exchange, item: DriveItem): void {
  const { env, access, request } = exchange;
  if (!startsAtBeginning(request)) return;
  if (access.share.permission === 'download') env.shares.record(access, 'download');
  else if (item.id === access.item.id) env.shares.record(access, 'open');
}

function extensionOf(item: FileItem): string {
  const named = extname(item.name).slice(1).toLowerCase();
  if (/^[a-z0-9]{1,8}$/u.test(named)) return named;
  const typed = item.mime.split('/')[1] ?? '';
  if (/^[a-z0-9]{1,8}$/u.test(typed)) return typed;
  throw new ApiError('invalid_request', 'This file has no recognised type to share outside.');
}

function disposition(item: FileItem, access: ShareAccess): Record<string, string> {
  return access.share.permission === 'download'
    ? {
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(item.name)}`,
      }
    : {};
}

function headersOf(
  item: FileItem,
  access: ShareAccess,
  mime: string,
): Readonly<Record<string, string>> {
  return {
    'content-type': mime,
    'cache-control': 'private, no-cache',
    'content-security-policy': 'sandbox',
    ...disposition(item, access),
  };
}

async function strippedSource(
  env: ShareRouteEnv,
  item: FileItem,
  access: ShareAccess,
  absolute: string,
): Promise<ByteSource> {
  const copy = await outsideCopy({
    source: absolute,
    extension: extensionOf(item),
    itemId: item.id,
    rev: item.rev,
    layout: env.layout,
    log,
  });
  return {
    size: (await stat(copy.path)).size,
    etag: `${item.etag}-outside`,
    headers: headersOf(item, access, STRIPPED_MIME[copy.extension] ?? item.mime),
    stream: (range) => createReadStream(copy.path, range),
  };
}

function isStrippable(
  item: FileItem,
): item is Extract<FileItem, { readonly kind: 'image' | 'video' }> {
  return item.kind === 'image' || item.kind === 'video';
}

async function serveFile(exchange: Exchange, item: FileItem): Promise<void> {
  const { env, access, request, response } = exchange;
  const resolved = await resolveInRoot(access.rootPath, item.relPath).catch(pathFailure);
  recordUse(exchange, item);
  if (isStrippable(item) && env.removeLocationOutside(access.share.createdBy)) {
    const source = await strippedSource(env, item, access, resolved.absolute);
    await serveBytes(source, request, response);
    return;
  }
  const handle = await openResolved(resolved, 'read').catch(pathFailure);
  try {
    await serveBytes(
      {
        size: (await handle.stat()).size,
        etag: item.etag,
        headers: headersOf(item, access, item.mime),
        stream: (range) => handle.createReadStream({ autoClose: false, ...range }),
      },
      request,
      response,
    );
  } finally {
    await handle.close();
  }
}

function entryOf(exchange: Exchange, item: DriveItem): Record<string, unknown> {
  const { env, access, token } = exchange;
  const url =
    access.passwordHash === null
      ? buildPath(`${MEDIA_PATHS.driveShare}/:itemId`, { token, itemId: item.id })
      : env.shares.link(access, token, item.id).url;
  return {
    id: item.id,
    name: item.name,
    kind: item.kind,
    bytes: item.bytes,
    mime: item.kind === 'folder' ? null : item.mime,
    modifiedAt: item.modifiedAt,
    url,
  };
}

function listFolder(exchange: Exchange, folder: DriveItem, url: URL): void {
  const { env, access, response } = exchange;
  const { after } = PAGE_QUERY.parse(Object.fromEntries(url.searchParams));
  const page = env.shares.children(folder, after ?? null, DRIVE_PAGE_SIZE);
  if (folder.id === access.item.id && after === undefined) env.shares.record(access, 'open');
  sendJson(response, 200, {
    id: folder.id,
    name: folder.name,
    permission: access.share.permission,
    entries: page.entries.map((entry) => entryOf(exchange, entry.item)),
    next: page.next,
  });
}

async function handleItem(
  env: ShareRouteEnv,
  request: IncomingMessage,
  response: ServerResponse,
  params: Readonly<Record<string, string>>,
): Promise<void> {
  const token = params['token'] ?? '';
  const access = env.shares.open(token);
  const item = env.shares.within(access, params['itemId'] ?? access.item.id);
  const url = new URL(request.url ?? '/', 'http://share');
  if (access.passwordHash !== null) env.shares.verifyLink(access, item.id, url);
  const exchange: Exchange = { env, access, token, request, response };
  if (item.kind === 'folder') listFolder(exchange, item, url);
  else await serveFile(exchange, item);
}

async function handlePassword(
  env: ShareRouteEnv,
  request: IncomingMessage,
  response: ServerResponse,
  params: Readonly<Record<string, string>>,
): Promise<void> {
  const token = params['token'] ?? '';
  const access = env.shares.open(token);
  const body = PASSWORD_BODY.safeParse(
    parseJsonBody(request, await readBody(request, PUBLIC_BODY_LIMIT)),
  );
  if (!body.success) {
    throw new ApiError('invalid_request', 'Send the password as JSON: { "password": "..." }.');
  }
  await env.shares.verifyPassword(access, body.data.password);
  env.shares.record(access, 'open');
  sendJson(response, 200, env.shares.link(access, token, access.item.id));
}

type ShareHandler = (
  env: ShareRouteEnv,
  request: IncomingMessage,
  response: ServerResponse,
  params: Readonly<Record<string, string>>,
) => Promise<void>;

const bound =
  (env: ShareRouteEnv, handler: ShareHandler): RawRoute['handle'] =>
  (request, response, params) =>
    handler(env, request, response, params);

export function shareRoutes(env: ShareRouteEnv): readonly RawRoute[] {
  return [
    { method: 'GET', path: MEDIA_PATHS.driveShare, handle: bound(env, handleItem) },
    { method: 'POST', path: MEDIA_PATHS.driveShare, handle: bound(env, handlePassword) },
    {
      method: 'GET',
      path: `${MEDIA_PATHS.driveShare}/:itemId`,
      handle: bound(env, handleItem),
    },
  ];
}
