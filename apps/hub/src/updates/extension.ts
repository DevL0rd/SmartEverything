import { API_ENDPOINTS as E, MEDIA_PATHS } from '@smarteverything/domain';
import { createReadStream } from 'node:fs';
import type { RunningExtension, ServerExtension } from '../extensions';
import type { MediaLinks } from '../server/media-links';
import type { RawRoute } from '../server/http-server';
import { attachment } from '../computers/file-download';
import { bound } from '../server/router';
import { sendBytes } from '../server/recording-files';
import { MachineUpdates } from './machine-updates';
import { ReleaseFolder } from './release-folder';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  zip: 'application/zip',
  nupkg: 'application/octet-stream',
  releases: 'text/plain; charset=utf-8',
};

export function machineUpdateRoute(links: MediaLinks, updates: MachineUpdates): RawRoute {
  return {
    method: 'GET',
    path: MEDIA_PATHS.machineUpdate,
    handle: async (request, response, params): Promise<void> => {
      links.verify(new URL(request.url ?? '/', 'http://hub'));
      const file = params['file'] ?? '';
      const found = await updates.artifact(file);
      await sendBytes(
        {
          size: found.size,
          headers: {
            'content-type': CONTENT_TYPES[found.kind] ?? 'application/octet-stream',
            'content-disposition': attachment(file),
            'cache-control': 'no-store',
          },
          stream: (range) =>
            createReadStream(
              found.path,
              range === undefined ? {} : { start: range.start, end: range.end },
            ),
        },
        request,
        response,
      );
    },
  };
}

export function machineUpdatesExtension(): ServerExtension {
  return (context): Promise<RunningExtension> => {
    const updates = new MachineUpdates(new ReleaseFolder(context.dataDirectory), context.links);
    return Promise.resolve({
      endpoints: {
        readMachineUpdate: bound(E.readMachineUpdate, ({ query }) => updates.offer(query)),
      },
      routes: [machineUpdateRoute(context.links, updates)],
      stop: () => Promise.resolve(),
    });
  };
}
