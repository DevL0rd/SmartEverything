import type { IncomingMessage, ServerResponse } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { ApiError, MEDIA_PATHS, buildPath, type DriveItem } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { isFileItem } from '../drive/file-item';
import { DrivePathError, openResolved, resolveInRoot } from '../drive/paths';
import { DRIVE_PAGE_SIZE } from '../drive/page-size';
import type { AlbumShareAccess, DriveShares, ShareAccess } from '../drive/shares';
import type { DerivedLayout } from '../photos/pipeline/derived-paths';
import { outsideCopy } from '../photos/pipeline/strip-location';
import { serveBytes, type ByteSource } from './file-serve';
import { PUBLIC_BODY_LIMIT, parseJsonBody, readBody, sendJson } from './http';
import type { RawRoute } from './http-server';

const log = new Logger('hub.drive');

type FileItem = Extract<DriveItem, { readonly mime: string }>;

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
  readonly removeLocationOutside: (sharedBy: string) => Promise<boolean>;
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

function downloads(access: ShareAccess, item: DriveItem): boolean {
  return access.share.permission === 'download' && !item.locked;
}

async function recordUse(exchange: Exchange, item: DriveItem): Promise<void> {
  const { env, access, request } = exchange;
  if (!startsAtBeginning(request)) return;
  if (downloads(access, item)) await env.shares.record(access, 'download');
  else if (item.id === access.entryId) await env.shares.record(access, 'open');
}

function extensionOf(item: FileItem): string {
  const named = extname(item.name).slice(1).toLowerCase();
  if (/^[a-z0-9]{1,8}$/u.test(named)) return named;
  const typed = item.mime.split('/')[1] ?? '';
  if (/^[a-z0-9]{1,8}$/u.test(typed)) return typed;
  throw new ApiError('invalid_request', 'This file has no recognised type to share outside.');
}

function disposition(item: FileItem, access: ShareAccess): Record<string, string> {
  return downloads(access, item)
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
  const resolved = await resolveInRoot(await env.shares.rootPathOf(item), item.relPath).catch(
    pathFailure,
  );
  await recordUse(exchange, item);
  if (isStrippable(item) && (await env.removeLocationOutside(access.share.createdBy))) {
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
    mime: isFileItem(item) ? item.mime : null,
    modifiedAt: item.modifiedAt,
    url,
  };
}

async function listFolder(exchange: Exchange, folder: DriveItem, url: URL): Promise<void> {
  const { env, access, response } = exchange;
  const { after } = PAGE_QUERY.parse(Object.fromEntries(url.searchParams));
  const page = await env.shares.children(folder, after ?? null, DRIVE_PAGE_SIZE);
  if (folder.id === access.entryId && after === undefined) await env.shares.record(access, 'open');
  sendJson(response, 200, {
    id: folder.id,
    name: folder.name,
    permission: downloads(access, folder) ? 'download' : 'view',
    entries: page.entries.map((entry) => entryOf(exchange, entry.item)),
    next: page.next,
  });
}

async function listAlbum(
  exchange: Exchange,
  album: AlbumShareAccess['album'],
  url: URL,
): Promise<void> {
  const { env, access, response } = exchange;
  const { after } = PAGE_QUERY.parse(Object.fromEntries(url.searchParams));
  const page = await env.shares.albumItems(album, after ?? null, DRIVE_PAGE_SIZE);
  if (after === undefined) await env.shares.record(access, 'open');
  sendJson(response, 200, {
    id: album.id,
    name: album.title,
    permission: access.share.permission,
    entries: page.items.map((item) => entryOf(exchange, item)),
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
  const access = await env.shares.open(token);
  const itemId = params['itemId'] ?? access.entryId;
  const url = new URL(request.url ?? '/', 'http://share');
  const exchange: Exchange = { env, access, token, request, response };
  if (access.kind === 'album' && itemId === access.entryId) {
    if (access.passwordHash !== null) env.shares.verifyLink(access, itemId, url);
    await listAlbum(exchange, access.album, url);
    return;
  }
  const item = await env.shares.within(access, itemId);
  if (access.passwordHash !== null) env.shares.verifyLink(access, item.id, url);
  if (item.kind === 'folder') await listFolder(exchange, item, url);
  else if ('mime' in item) await serveFile(exchange, item);
  else throw new ApiError('not_found', 'This link is no longer available.');
}

async function handlePassword(
  env: ShareRouteEnv,
  request: IncomingMessage,
  response: ServerResponse,
  params: Readonly<Record<string, string>>,
): Promise<void> {
  const token = params['token'] ?? '';
  const access = await env.shares.open(token);
  const body = PASSWORD_BODY.safeParse(
    parseJsonBody(request, await readBody(request, PUBLIC_BODY_LIMIT)),
  );
  if (!body.success) {
    throw new ApiError('invalid_request', 'Send the password as JSON: { "password": "..." }.');
  }
  await env.shares.verifyPassword(access, body.data.password);
  await env.shares.record(access, 'open');
  sendJson(response, 200, env.shares.link(access, token, access.entryId));
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
