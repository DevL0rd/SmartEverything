import { ApiError, type DriveVersion, type MediaLink } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { inLockedFolder, type DriveActor } from '../drive/access';
import { isFileItem, type FileItem } from '../drive/file-item';
import { versionRelPath } from '../drive/intents';
import { DrivePathError, openResolved, resolveInRoot } from '../drive/paths';
import type { Store } from '../store/store';
import { readableItem, type DriveExchange, type DriveFiles } from './drive-files';
import { serveBytes } from './file-serve';

const log = new Logger('hub.drive');

export interface DriveVersionFiles {
  readonly files: DriveFiles;
  readonly versions: Pick<Store['driveVersions'], 'find'>;
}

interface Located {
  readonly item: FileItem;
  readonly version: DriveVersion;
  readonly rootPath: string;
}

function hidden(): ApiError {
  return new ApiError('not_found', 'There is no such version for this caller.');
}

function versionOf(deps: DriveVersionFiles, itemId: string, versionId: string): DriveVersion {
  const entry = deps.versions.find(versionId);
  if (entry?.version.itemId !== itemId) throw hidden();
  return entry.version;
}

export function driveVersionLink(
  deps: DriveVersionFiles,
  actor: DriveActor,
  target: { readonly itemId: string; readonly versionId: string },
): MediaLink {
  const { item } = readableItem(deps.files, actor, target.itemId);
  if (!isFileItem(item)) throw hidden();
  versionOf(deps, item.id, target.versionId);
  return deps.files.links.driveVersion(item.id, target.versionId);
}

function locate(deps: DriveVersionFiles, itemId: string, versionId: string): Located {
  const item = deps.files.store.driveItems.find(itemId, null);
  const root = item === undefined ? undefined : deps.files.store.driveRoots.find(item.rootId);
  if (item === undefined || root === undefined || inLockedFolder(item) || !isFileItem(item)) {
    throw hidden();
  }
  return { item, version: versionOf(deps, itemId, versionId), rootPath: root.path };
}

function pathFailure(cause: unknown): never {
  if (cause instanceof DrivePathError) {
    log.warn('drive_version.unreadable', { failure: cause.failure });
    throw new ApiError('not_found', 'The version is not available on disk.');
  }
  throw cause;
}

export async function serveDriveVersion(
  deps: DriveVersionFiles,
  exchange: DriveExchange,
  target: { readonly itemId: string; readonly versionId: string },
): Promise<void> {
  deps.files.links.verify(exchange.url);
  const { item, version, rootPath } = locate(deps, target.itemId, target.versionId);
  const resolved = await resolveInRoot(rootPath, versionRelPath(version.sha256)).catch(pathFailure);
  const handle = await openResolved(resolved, 'read').catch(pathFailure);
  try {
    await serveBytes(
      {
        size: (await handle.stat()).size,
        etag: version.sha256,
        headers: {
          'content-type': item.mime,
          'cache-control': 'private, max-age=31536000, immutable',
        },
        stream: (range) => handle.createReadStream({ autoClose: false, ...range }),
      },
      exchange.request,
      exchange.response,
    );
  } finally {
    await handle.close();
  }
}
