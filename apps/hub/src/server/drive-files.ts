import type { IncomingMessage, ServerResponse } from 'node:http';
import { ApiError, type ComputerNodeRow, type DriveItem } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { DrivePathError, openResolved, resolveInRoot } from '../drive/paths';
import { isFileItem, type FileItem } from '../drive/file-item';
import {
  canRead,
  inLockedFolder,
  itemAccess,
  type DriveActor,
  type ItemAccess,
} from '../drive/access';
import { mayExportItem, requireExport } from '../drive/sharing/export-guard';
import { isLockedLink, verifyLockedLink } from '../photos/organise/locked-links';
import { PHOTO_VISIBLE } from '../photos/membership';
import type { Store } from '../store/store';
import { z } from 'zod';
import { serveBytes } from './file-serve';
import { bearerOf } from './http';
import type { MediaLinks, VerifiedDriveLink } from './media-links';

const log = new Logger('hub.drive');

export interface DriveFileNodes {
  readonly authenticate: (token: string | null) => ComputerNodeRow;
  readonly actorOf: (node: ComputerNodeRow) => DriveActor;
}

export interface DriveFiles {
  readonly store: Pick<
    Store,
    'context' | 'driveRoots' | 'driveItems' | 'driveGrants' | 'photoLocked'
  >;
  readonly links: MediaLinks;
  readonly nodes: DriveFileNodes;
  readonly now: () => Date;
}

export interface DriveExchange {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly url: URL;
}

interface Located {
  readonly item: FileItem;
  readonly rootPath: string;
  readonly access: ItemAccess | null;
}

function hidden(): ApiError {
  return new ApiError('not_found', 'There is no such file for this caller.');
}

function noBytes(item: DriveItem): ApiError {
  return new ApiError(
    'invalid_request',
    item.kind === 'folder'
      ? 'A folder has no bytes to download.'
      : 'A link or special file has no bytes to download; the hub never follows links.',
  );
}

const SHOWN = z.strictObject({ id: z.string() });

function reach(
  files: DriveFiles,
  actor: DriveActor,
  root: Parameters<typeof itemAccess>[2],
  item: DriveItem,
): ItemAccess {
  const access = itemAccess(files.store, actor, root, item);
  if (canRead(access)) return access;
  const shown = files.store.context.sql.get(
    SHOWN,
    `select i.id from drive_items i join drive_roots r on r.id = i.root_id
      where i.id = $itemId and ${PHOTO_VISIBLE}`,
    { itemId: item.id, profile: actor.profileId },
  );
  return shown === undefined ? access : 'view';
}

function readable(
  files: DriveFiles,
  itemId: string,
  actor: DriveActor | null,
): (Omit<Located, 'item'> & { readonly item: DriveItem }) | null {
  const item = files.store.driveItems.find(itemId, actor?.profileId ?? null);
  const root = item === undefined ? undefined : files.store.driveRoots.find(item.rootId);
  if (item === undefined || root === undefined || inLockedFolder(item)) return null;
  const access = actor === null ? null : reach(files, actor, root, item);
  return access !== null && !canRead(access) ? null : { item, rootPath: root.path, access };
}

function locate(files: DriveFiles, itemId: string, actor: DriveActor | null): Located {
  const located = readable(files, itemId, actor);
  if (located === null) throw hidden();
  if (!isFileItem(located.item)) throw noBytes(located.item);
  return { ...located, item: located.item };
}

function lifetimeSeconds(files: DriveFiles, expiresAt: Date): number {
  return Math.max(0, Math.floor((expiresAt.getTime() - files.now().getTime()) / 1000));
}

function pathFailure(cause: unknown): never {
  if (cause instanceof DrivePathError) {
    log.warn('drive_file.unreadable', { failure: cause.failure });
    throw new ApiError('not_found', 'The file is not available on disk.');
  }
  throw cause;
}

function dispositionOf(item: FileItem, download: boolean): Record<string, string> {
  return download
    ? { 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(item.name)}` }
    : {};
}

async function serveLocated(
  { item, rootPath }: Located,
  delivery: { readonly cacheControl: string; readonly download: boolean },
  { request, response }: DriveExchange,
): Promise<void> {
  const resolved = await resolveInRoot(rootPath, item.relPath).catch(pathFailure);
  const handle = await openResolved(resolved, 'read').catch(pathFailure);
  try {
    await serveBytes(
      {
        size: (await handle.stat()).size,
        etag: item.etag,
        headers: {
          'content-type': item.mime,
          'cache-control': delivery.cacheControl,
          ...dispositionOf(item, delivery.download),
        },
        stream: (range) => handle.createReadStream({ autoClose: false, ...range }),
      },
      request,
      response,
    );
  } finally {
    await handle.close();
  }
}

async function serveByNode(
  files: DriveFiles,
  itemId: string,
  token: string,
  exchange: DriveExchange,
): Promise<void> {
  const actor = files.nodes.actorOf(files.nodes.authenticate(token));
  const located = locate(files, itemId, actor);
  if (located.access !== null) requireExport(located.access, located.item);
  await serveLocated(located, { cacheControl: 'private, no-cache', download: false }, exchange);
}

interface Signed {
  readonly link: VerifiedDriveLink;
  readonly located: Located;
}

function lockedSigned(files: DriveFiles, itemId: string, url: URL): Signed {
  const { item, link } = verifyLockedLink(files.store, files.links, url, itemId);
  if (!isFileItem(item)) throw noBytes(item);
  const root = files.store.driveRoots.byId(item.rootId);
  return { link, located: { item, rootPath: root.path, access: null } };
}

function signed(files: DriveFiles, itemId: string, url: URL): Signed {
  if (isLockedLink(url)) return lockedSigned(files, itemId, url);
  const link = files.links.verifyDrive(url);
  return { link, located: locate(files, itemId, null) };
}

async function serveBySignature(
  files: DriveFiles,
  itemId: string,
  exchange: DriveExchange,
): Promise<void> {
  const { link, located } = signed(files, itemId, exchange.url);
  if (located.item.rev !== link.rev) {
    throw new ApiError(
      'link_expired',
      'This file changed since the link was made; ask for a new one.',
    );
  }
  const seconds = lifetimeSeconds(files, link.expiresAt);
  await serveLocated(
    located,
    { cacheControl: `private, max-age=${String(seconds)}, immutable`, download: link.download },
    exchange,
  );
}

export async function serveDriveFile(
  files: DriveFiles,
  exchange: DriveExchange,
  itemId: string,
): Promise<void> {
  const token = bearerOf(exchange.request);
  await (token === null
    ? serveBySignature(files, itemId, exchange)
    : serveByNode(files, itemId, token, exchange));
}

export function readableItem(
  files: DriveFiles,
  actor: DriveActor,
  itemId: string,
): { readonly item: DriveItem; readonly access: ItemAccess } {
  const located = readable(files, itemId, actor);
  const access = located?.access ?? null;
  if (located === null || access === null) throw hidden();
  return { item: located.item, access };
}

export function driveFileLink(
  files: DriveFiles,
  actor: DriveActor,
  itemId: string,
): ReturnType<MediaLinks['driveFile']> {
  const { item } = locate(files, itemId, actor);
  return files.links.driveFile(item.id, item.rev);
}

export function driveDownloadLink(
  files: DriveFiles,
  actor: DriveActor,
  itemId: string,
): ReturnType<MediaLinks['driveDownload']> | null {
  const { item, access } = locate(files, itemId, actor);
  return access !== null && !mayExportItem(access, item)
    ? null
    : files.links.driveDownload(item.id, item.rev);
}
