import { ApiError, FILE_RANGE, MEDIA_PATHS } from '@smarteverything/domain';
import { Readable } from 'node:stream';
import { serveBytes } from '../server/file-serve';
import type { RawRoute } from '../server/http-server';
import type { MediaLinks } from '../server/media-links';
import type { ComputerService } from './computer-service';
import { asked, verifiedTarget } from './file-claims';
import { attachment, chunks, inline, type ChunkOf } from './file-download';

export interface ComputerZipEntryOptions {
  readonly service: ComputerService;
  readonly links: Pick<MediaLinks, 'verifyClaimed'>;
}

export function computerZipEntryRoute({ service, links }: ComputerZipEntryOptions): RawRoute {
  return {
    method: 'GET',
    path: MEDIA_PATHS.computerZipEntry,
    handle: async (request, response, params): Promise<void> => {
      const deviceId = params['deviceId'] ?? '';
      const index = Number(params['index']);
      if (!Number.isInteger(index) || index < 0) {
        throw new ApiError('invalid_request', 'The entry number is not a whole number.');
      }
      const { path, viewer, download } = verifiedTarget(links, request);
      const chunkOf: ChunkOf = (start, length) =>
        asked(
          service,
          { viewer, deviceId },
          { verb: 'zip_entry_range', path, index, start, length },
          FILE_RANGE,
        );
      const head = await chunkOf(0, 1);
      await serveBytes(
        {
          size: head.size,
          headers: {
            'content-type': head.mimeType,
            'content-disposition': download ? attachment(head.name) : inline(head.name),
            'cache-control': 'private, no-store',
          },
          stream: (range) =>
            Readable.from(chunks(chunkOf, range?.start ?? 0, range?.end ?? head.size - 1)),
        },
        request,
        response,
      );
    },
  };
}
