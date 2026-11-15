import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { ApiError } from '@smarteverything/domain';
import { fsCode } from '../../../fs-code';
import type { DriveExchange } from '../../../server/drive-files';
import { serveBytes } from '../../../server/file-serve';
import type { MediaLinks } from '../../../server/media-links';
import type { DriveFolderIconsRepository } from '../../../store/repositories/drive-folder-icons';
import type { DriveItemsRepository } from '../../../store/repositories/drive-items';
import { folderIconFile, type FolderIconEnvironment } from './refresh';

export interface FolderIconServing {
  readonly store: {
    readonly driveItems: Pick<DriveItemsRepository, 'find'>;
    readonly driveFolderIcons: Pick<DriveFolderIconsRepository, 'find'>;
  };
  readonly links: Pick<MediaLinks, 'verifyDrive'>;
  readonly derivedDirectory: FolderIconEnvironment['derivedDirectory'];
  readonly now: () => Date;
}

export async function serveFolderIcon(
  serving: FolderIconServing,
  exchange: DriveExchange,
  itemId: string,
): Promise<void> {
  const link = serving.links.verifyDrive(exchange.url);
  const folder = serving.store.driveItems.find(itemId, null);
  if (folder?.kind !== 'folder') throw new ApiError('not_found', 'There is no such folder.');
  if (folder.rev !== link.rev) {
    throw new ApiError('link_expired', 'This folder changed; request a new link.');
  }
  const icon = serving.store.driveFolderIcons.find(itemId);
  if (icon === undefined) throw new ApiError('not_found', 'This folder has no icon file.');
  const path = folderIconFile(serving, itemId, icon.imageSha256);
  const info = await stat(path).catch((cause: unknown) => {
    if (fsCode(cause) === 'ENOENT')
      throw new ApiError('not_found', 'The folder icon is not ready.');
    throw cause;
  });
  const seconds = Math.max(
    0,
    Math.floor((link.expiresAt.getTime() - serving.now().getTime()) / 1000),
  );
  await serveBytes(
    {
      size: info.size,
      etag: icon.imageSha256,
      headers: {
        'content-type': 'image/png',
        'cache-control': `private, max-age=${String(seconds)}, immutable`,
      },
      stream: (range) => createReadStream(path, range),
    },
    exchange.request,
    exchange.response,
  );
}
