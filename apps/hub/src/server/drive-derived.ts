import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { ApiError } from '@smarteverything/domain';
import { z } from 'zod';
import { fsCode } from '../fs-code';
import { derivedPath, DERIVED_MIME } from '../photos/pipeline/derived-paths';
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

const SIZE = z.enum(['thumb', 'preview', 'playable']);

export async function serveDriveDerived(
  deps: PhotoPipelineDeps & Pick<DriveDeps, 'links' | 'now'>,
  mediaPipeline: PhotoPipeline,
  exchange: DriveExchange,
  target: { readonly itemId: string; readonly size: string },
): Promise<void> {
  const { itemId } = target;
  const size = SIZE.parse(target.size);
  const link = deps.links.verifyDrive(exchange.url);
  const item = deps.store.driveItems.byId(itemId, null);
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
  const path = derivedPath(deps.layout, { itemId, rev: item.rev, size });
  const info = await stat(path).catch((cause: unknown) => {
    if (fsCode(cause) === 'ENOENT')
      throw new ApiError('not_found', 'The image preview is not ready.');
    throw cause;
  });
  const seconds = Math.max(0, Math.floor((link.expiresAt.getTime() - deps.now().getTime()) / 1000));
  await serveBytes(
    {
      size: info.size,
      etag: `${itemId}-${String(item.rev)}-${size}`,
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
