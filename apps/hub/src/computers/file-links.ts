import {
  ApiError,
  FILE_PROPERTIES,
  FILE_RANGE,
  MEDIA_PATHS,
  type ComputerFileLinks,
  type ComputerZipEntryLink,
} from '@smarteverything/domain';
import { Readable } from 'node:stream';
import type { Caller } from '../server/auth';
import { serveBytes } from '../server/file-serve';
import type { RawRoute } from '../server/http-server';
import type { MediaLinks } from '../server/media-links';
import type { ComputerService } from './computer-service';
import { asked, signedFileLink, verifiedTarget } from './file-claims';
import { chunks, inline, type ChunkOf } from './file-download';
import { hasPicture, thumbVersion } from './file-thumbs';

export interface ComputerFileLinksOptions {
  readonly service: ComputerService;
  readonly links: Pick<MediaLinks, 'claimed' | 'verifyClaimed'>;
}

export class ComputerFileLinker {
  constructor(private readonly options: ComputerFileLinksOptions) {}

  async links(caller: Caller, deviceId: string, path: string): Promise<ComputerFileLinks> {
    const { service, links } = this.options;
    const properties = await service.ask(
      { caller, deviceId, request: { verb: 'file_properties', path } },
      FILE_PROPERTIES,
    );
    if (properties.kind !== 'file' && properties.kind !== 'link') {
      throw new ApiError('conflict', 'Only a file has links; this is a folder or special item.');
    }
    const viewer = service.viewer(caller);
    const params = { deviceId };
    return {
      path,
      file: signedFileLink(links, 'computerFile', params, { path, viewer }),
      thumb:
        hasPicture(properties.mimeType) && properties.size > 0
          ? signedFileLink(links, 'computerThumb', params, {
              path,
              viewer,
              version: thumbVersion(properties),
            })
          : null,
    };
  }

  async zipEntry(
    caller: Caller,
    deviceId: string,
    path: string,
    index: number,
  ): Promise<ComputerZipEntryLink> {
    const { service, links } = this.options;
    await service.ask(
      { caller, deviceId, request: { verb: 'file_properties', path } },
      FILE_PROPERTIES,
    );
    const viewer = service.viewer(caller);
    const params = { deviceId, index: String(index) };
    return {
      index,
      file: signedFileLink(links, 'computerZipEntry', params, { path, viewer }),
      download: signedFileLink(links, 'computerZipEntry', params, {
        path,
        viewer,
        download: true,
      }),
    };
  }

  fileRoute(): RawRoute {
    return {
      method: 'GET',
      path: MEDIA_PATHS.computerFile,
      handle: async (request, response, params): Promise<void> => {
        const { service, links } = this.options;
        const deviceId = params['deviceId'] ?? '';
        const { path, viewer } = verifiedTarget(links, request);
        const chunkOf: ChunkOf = (start, length) =>
          asked(
            service,
            { viewer, deviceId },
            { verb: 'file_range', path, start, length },
            FILE_RANGE,
          );
        const head = await chunkOf(0, 1);
        await serveBytes(
          {
            size: head.size,
            headers: {
              'content-type': head.mimeType,
              'content-disposition': inline(head.name),
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
}
