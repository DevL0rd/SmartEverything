import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import {
  ApiError,
  FILE_PROPERTIES,
  FILE_RANGE,
  MEDIA_PATHS,
  type FileProperties,
} from '@smarteverything/domain';
import sharp from 'sharp';
import { fsCode } from '../fs-code';
import {
  DERIVED_LONG_EDGE,
  DERIVED_MIME,
  derivedPath,
  pruneDerived,
  writeDerived,
  type DerivedKey,
  type DerivedLayout,
} from '../photos/pipeline/derived-paths';
import { serveBytes } from '../server/file-serve';
import type { RawRoute } from '../server/http-server';
import type { MediaLinks } from '../server/media-links';
import { guarded } from './computer-access';
import type { ComputerService } from './computer-service';
import { asked, verifiedTarget, type FileAsker } from './file-claims';
import { chunks, type ChunkOf } from './file-download';

const PICTURE_MIMES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/tiff',
]);

export function hasPicture(mimeType: string | null): boolean {
  return mimeType !== null && PICTURE_MIMES.has(mimeType);
}

export function thumbVersion(properties: Pick<FileProperties, 'size' | 'modifiedAt'>): string {
  return createHash('sha256')
    .update(`${String(properties.size)}\n${properties.modifiedAt}`)
    .digest('hex')
    .slice(0, 16);
}

export function thumbKey(deviceId: string, path: string, version: string): DerivedKey {
  const id = createHash('sha256').update(`${deviceId}\0${path}`).digest('hex').slice(0, 40);
  return {
    itemId: `computer-${id}`,
    rev: Number.parseInt(version.slice(0, 12), 16) + 1,
    size: 'thumb',
  };
}

export interface ComputerThumbsOptions {
  readonly service: ComputerService;
  readonly links: Pick<MediaLinks, 'verifyClaimed'>;
  readonly layout: DerivedLayout;
}

export class ComputerThumbs {
  private readonly making = new Map<string, Promise<void>>();

  constructor(private readonly options: ComputerThumbsOptions) {}

  route(): RawRoute {
    return {
      method: 'GET',
      path: MEDIA_PATHS.computerThumb,
      handle: async (request, response, params): Promise<void> => {
        const deviceId = params['deviceId'] ?? '';
        const { path, viewer, version } = verifiedTarget(this.options.links, request);
        if (version === null) {
          throw new ApiError('invalid_request', 'This media link carries no file version.');
        }
        await guarded(() => this.options.service.access.require(deviceId, 'files', viewer));
        const key = thumbKey(deviceId, path, version);
        const target = derivedPath(this.options.layout, key);
        const asker = { viewer, deviceId };
        const info = await this.made(target, () => this.make(asker, { path, version }, key));
        await serveBytes(
          {
            size: info.size,
            etag: `${key.itemId}-${String(key.rev)}`,
            headers: { 'content-type': DERIVED_MIME, 'cache-control': 'private, no-store' },
            stream: (range) => createReadStream(target, range),
          },
          request,
          response,
        );
      },
    };
  }

  private async made(target: string, make: () => Promise<void>): Promise<{ size: number }> {
    const found = await statOf(target);
    if (found !== null) return found;
    const running = this.making.get(target) ?? make().finally(() => this.making.delete(target));
    this.making.set(target, running);
    await running;
    const made = await statOf(target);
    if (made === null) throw new ApiError('not_found', 'The thumbnail is not available.');
    return made;
  }

  private async make(
    asker: FileAsker,
    file: { readonly path: string; readonly version: string },
    key: DerivedKey,
  ): Promise<void> {
    const { path, version } = file;
    const properties = await asked(
      this.options.service,
      asker,
      { verb: 'file_properties', path },
      FILE_PROPERTIES,
    );
    if (thumbVersion(properties) !== version) {
      throw new ApiError('link_expired', 'This file changed; ask for a new link.');
    }
    if (!hasPicture(properties.mimeType) || properties.size === 0) {
      throw new ApiError('invalid_request', 'This file has no picture to shrink.');
    }
    const chunkOf: ChunkOf = (start, length) =>
      asked(this.options.service, asker, { verb: 'file_range', path, start, length }, FILE_RANGE);
    const edge = DERIVED_LONG_EDGE.thumb;
    const shrink = sharp({ failOn: 'error' })
      .rotate()
      .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
      .webp();
    const parts: Buffer[] = [];
    await pipeline(
      Readable.from(chunks(chunkOf, 0, properties.size - 1)),
      shrink,
      async (source: AsyncIterable<Buffer>): Promise<void> => {
        for await (const part of source) parts.push(part);
      },
    );
    await writeDerived(this.options.layout, key, Buffer.concat(parts));
    await pruneDerived(this.options.layout, key.itemId, key.rev);
  }
}

async function statOf(target: string): Promise<{ size: number } | null> {
  try {
    return await stat(target);
  } catch (cause) {
    if (fsCode(cause) === 'ENOENT') return null;
    throw cause;
  }
}
