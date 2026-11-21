import { ApiError, type DriveItem, type DriveZipEntry } from '@smarteverything/domain';
import { messageOf } from '@smarteverything/logging';
import { classify } from '../file-type';
import { isFileItem } from '../file-item';
import { DrivePathError, resolveInRoot } from '../paths';
import type { DriveExchange } from '../../server/drive-files';
import { serveBytes } from '../../server/file-serve';
import type { MediaLinks } from '../../server/media-links';
import type { StoredDrive } from '../../store/repositories/drive-roots';
import { locateZipEntry, ZipEntryError, type ZipEntrySource } from './zip-index';
import { ZipReadError } from './zip-file';
import { isZipItem } from './zip-item';

export interface ZipEntryServing {
  readonly item: (itemId: string) => Promise<DriveItem | undefined>;
  readonly root: (rootId: string) => Promise<Pick<StoredDrive, 'path'> | undefined>;
  readonly links: Pick<MediaLinks, 'verifyDrive'>;
  readonly now: () => Date;
}

export function zipFailure(cause: unknown): never {
  if (cause instanceof ZipEntryError) {
    throw new ApiError(
      cause.failure === 'missing' ? 'not_found' : 'invalid_request',
      cause.message,
    );
  }
  if (cause instanceof DrivePathError) {
    throw new ApiError('not_found', 'The archive is not available on disk.');
  }
  if (cause instanceof ZipReadError) {
    throw new ApiError('invalid_request', cause.message, messageOf(cause.cause));
  }
  throw cause;
}

function dispositionOf(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/gu, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

function headersOf(
  entry: DriveZipEntry,
  download: boolean,
  seconds: number,
): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': classify(entry.name).mime,
    'cache-control': `private, max-age=${String(seconds)}, immutable`,
  };
  if (download) headers['content-disposition'] = dispositionOf(entry.name);
  return headers;
}

export async function serveZipEntry(
  serving: ZipEntryServing,
  exchange: DriveExchange,
  target: { readonly itemId: string; readonly index: string },
): Promise<void> {
  const index = Number(target.index);
  if (!Number.isInteger(index) || index < 0) {
    throw new ApiError('invalid_request', 'The entry number is not a whole number.');
  }
  const link = serving.links.verifyDrive(exchange.url);
  const item = await serving.item(target.itemId);
  const root = item === undefined ? undefined : await serving.root(item.rootId);
  if (item === undefined || root === undefined || !isFileItem(item) || !isZipItem(item)) {
    throw new ApiError('not_found', 'There is no such archive.');
  }
  if (item.rev !== link.rev) {
    throw new ApiError('link_expired', 'This archive changed; request a new link.');
  }
  const resolved = await resolveInRoot(root.path, item.relPath).catch(zipFailure);
  const source: ZipEntrySource = await locateZipEntry(resolved.absolute, index).catch(zipFailure);
  const seconds = Math.max(
    0,
    Math.floor((link.expiresAt.getTime() - serving.now().getTime()) / 1000),
  );
  await serveBytes(
    {
      size: source.bytes,
      etag: `${item.etag}-z${String(index)}`,
      headers: headersOf(source.entry, link.download, seconds),
      stream: source.stream,
    },
    exchange.request,
    exchange.response,
  );
}
