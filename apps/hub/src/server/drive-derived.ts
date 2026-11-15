import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { ApiError, type DriveItem } from '@smarteverything/domain';
import { z } from 'zod';
import { inLockedFolder, lockedTrash } from '../drive/access';
import { fsCode } from '../fs-code';
import { isLockedLink, verifyLockedLink } from '../photos/organise/locked-links';
import { derivedPath, DERIVED_MIME, type DerivedKey } from '../photos/pipeline/derived-paths';
import { locatePlayable, playableSource } from '../photos/pipeline/playable';
import {
  locateMedia,
  type PhotoPipeline,
  type PhotoPipelineDeps,
} from '../photos/pipeline/runtime';
import { DriveMediaRepository } from '../store/repositories/drive-media';
import type { DriveDeps } from './handlers/drive-wiring';
import { serveBytes } from './file-serve';
import type { DriveExchange } from './drive-files';
import type { VerifiedDriveLink } from './media-links';

const SIZE = z.enum(['thumb', 'preview', 'playable']);

type DerivedDeps = PhotoPipelineDeps & Pick<DriveDeps, 'links' | 'now'>;

function verified(
  deps: DerivedDeps,
  url: URL,
  itemId: string,
): { readonly item: DriveItem; readonly link: VerifiedDriveLink } {
  if (isLockedLink(url)) return verifyLockedLink(deps.store, deps.links, url, itemId);
  const link = deps.links.verifyDrive(url);
  const item = deps.store.driveItems.byId(itemId, null);
  if (inLockedFolder(item))
    throw new ApiError('not_found', 'There is no such file for this caller.');
  return { item, link };
}

export async function serveDriveDerived(
  deps: DerivedDeps,
  mediaPipeline: PhotoPipeline,
  exchange: DriveExchange,
  target: { readonly itemId: string; readonly size: string },
): Promise<void> {
  const { itemId } = target;
  const size = SIZE.parse(target.size);
  if (!isLockedLink(exchange.url) && deps.store.driveItems.find(itemId, null) === undefined) {
    await serveTrashed(deps, exchange, itemId, size);
    return;
  }
  const { item, link } = verified(deps, exchange.url, itemId);
  if (item.rev !== link.rev)
    throw new ApiError('link_expired', 'This file changed; request a new link.');
  mediaPipeline.runner.prioritise(itemId);
  if (size === 'playable') {
    const media = new DriveMediaRepository(deps.parts.context).byId(itemId);
    const location = await locatePlayable(deps.layout, item, media, () => locateMedia(deps, item));
    if (location === undefined) throw new ApiError('not_found', 'The playable video is not ready.');
    await serveBytes(playableSource(location), exchange.request, exchange.response);
    return;
  }
  await serveDerived(deps, exchange, { itemId, rev: item.rev, size }, link);
}

async function serveTrashed(
  deps: DerivedDeps,
  exchange: DriveExchange,
  itemId: string,
  size: z.infer<typeof SIZE>,
): Promise<void> {
  const link = deps.links.verifyDrive(exchange.url);
  const entry = deps.store.driveTrash.find(itemId);
  const rev =
    entry === undefined || lockedTrash(entry) ? null : deps.store.driveTrash.thumbRev(itemId);
  if (size !== 'thumb' || rev === null) {
    throw new ApiError('not_found', 'There is no such file for this caller.');
  }
  if (rev !== link.rev)
    throw new ApiError('link_expired', 'This file changed; request a new link.');
  await serveDerived(deps, exchange, { itemId, rev, size }, link);
}

async function serveDerived(
  deps: DerivedDeps,
  exchange: DriveExchange,
  key: DerivedKey,
  link: VerifiedDriveLink,
): Promise<void> {
  const { itemId, size } = key;
  const path = derivedPath(deps.layout, key);
  const info = await stat(path).catch((cause: unknown) => {
    if (fsCode(cause) === 'ENOENT')
      throw new ApiError('not_found', 'The image preview is not ready.');
    throw cause;
  });
  const seconds = Math.max(0, Math.floor((link.expiresAt.getTime() - deps.now().getTime()) / 1000));
  await serveBytes(
    {
      size: info.size,
      etag: `${itemId}-${String(key.rev)}-${size}`,
      headers: {
        'content-type': DERIVED_MIME,
        'cache-control': `private, max-age=${String(seconds)}, immutable`,
      },
      stream: (range) => createReadStream(path, range),
    },
    exchange.request,
    exchange.response,
  );
}
