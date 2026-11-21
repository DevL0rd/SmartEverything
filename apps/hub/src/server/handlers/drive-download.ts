import { API_ENDPOINTS as E, MEDIA_PATHS } from '@smarteverything/domain';
import { pipeline, Readable } from 'node:stream';
import { promisify } from 'node:util';
import { attachment } from '../../computers/file-download';
import type { DriveDownloads } from '../../drive/download-zip';
import { zipChunks } from '../../zip/zip-stream';
import type { RawRoute } from '../http-server';
import type { MediaLinks } from '../media-links';
import { bound, type Routes } from '../router';
import { refusing } from './drive-errors';
import { actorOf } from './drive-services';

const streamed = promisify(pipeline);

export function driveDownloadRoutes(downloads: DriveDownloads): Routes<'prepareDriveDownload'> {
  return {
    prepareDriveDownload: bound(E.prepareDriveDownload, ({ body, caller }) =>
      refusing(() => downloads.prepare(actorOf(caller), body.itemIds)),
    ),
  };
}

async function* continued(
  first: IteratorResult<Buffer>,
  rest: AsyncGenerator<Buffer>,
): AsyncGenerator<Buffer> {
  if (first.done === true) return;
  yield first.value;
  yield* rest;
}

export function driveDownloadRawRoute(
  links: Pick<MediaLinks, 'verify'>,
  downloads: DriveDownloads,
): RawRoute {
  return {
    method: 'GET',
    path: MEDIA_PATHS.driveDownload,
    handle: async (request, response, params): Promise<void> => {
      links.verify(new URL(request.url ?? '/', 'http://hub'));
      const ticket = downloads.take(params['ticketId'] ?? '');
      const bytes = zipChunks(ticket.entries);
      const first = await bytes.next();
      response.writeHead(200, {
        'content-type': 'application/zip',
        'content-disposition': attachment(ticket.name),
        'cache-control': 'no-store',
      });
      await streamed(Readable.from(continued(first, bytes)), response);
    },
  };
}
