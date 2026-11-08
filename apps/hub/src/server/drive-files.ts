import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  ApiError,
  type ComputerNodeRow,
  type DriveItem,
  type DriveRoot,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { DrivePathError, openResolved, resolveInRoot } from '../drive/paths';
import { rootVisibleTo, type DriveActor } from '../drive/service-read';
import type { Store } from '../store/store';
import { serveBytes } from './file-serve';
import { bearerOf } from './http';
import type { MediaLinks } from './media-links';

const log = new Logger('hub.drive');

export interface DriveFileNodes {
  readonly authenticate: (token: string | null) => ComputerNodeRow;
  readonly actorOf: (node: ComputerNodeRow) => DriveActor;
}

export interface DriveFiles {
  readonly store: Pick<Store, 'driveRoots' | 'driveItems'>;
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
  readonly item: Exclude<DriveItem, { readonly kind: 'folder' }>;
  readonly rootPath: string;
}

function hidden(): ApiError {
  return new ApiError('not_found', 'There is no such file for this caller.');
}

function locate(files: DriveFiles, itemId: string, actor: DriveActor | null): Located {
  const item = files.store.driveItems.find(itemId);
  const root: DriveRoot | undefined =
    item === undefined ? undefined : files.store.driveRoots.find(item.rootId);
  if (item === undefined || root === undefined) throw hidden();
  if (actor !== null && !rootVisibleTo(actor, root)) throw hidden();
  if (item.kind === 'folder') {
    throw new ApiError('invalid_request', 'A folder has no bytes to download.');
  }
  if (root.path === null) throw hidden();
  return { item, rootPath: root.path };
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

async function serveLocated(
  { item, rootPath }: Located,
  cacheControl: string,
  { request, response }: DriveExchange,
): Promise<void> {
  const resolved = await resolveInRoot(rootPath, item.relPath).catch(pathFailure);
  const handle = await openResolved(resolved, 'read').catch(pathFailure);
  try {
    await serveBytes(
      {
        size: (await handle.stat()).size,
        etag: item.etag,
        headers: { 'content-type': item.mime, 'cache-control': cacheControl },
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
  await serveLocated(locate(files, itemId, actor), 'private, no-cache', exchange);
}

async function serveBySignature(
  files: DriveFiles,
  itemId: string,
  exchange: DriveExchange,
): Promise<void> {
  const link = files.links.verifyDrive(exchange.url);
  const located = locate(files, itemId, null);
  if (located.item.rev !== link.rev) {
    throw new ApiError(
      'link_expired',
      'This file changed since the link was made; ask for a new one.',
    );
  }
  const seconds = lifetimeSeconds(files, link.expiresAt);
  await serveLocated(located, `private, max-age=${String(seconds)}, immutable`, exchange);
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

export function driveFileLink(
  files: DriveFiles,
  actor: DriveActor,
  itemId: string,
): ReturnType<MediaLinks['driveFile']> {
  const { item } = locate(files, itemId, actor);
  return files.links.driveFile(item.id, item.rev);
}
