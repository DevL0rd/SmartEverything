import { API_ENDPOINTS as E, ApiError, MEDIA_PATHS } from '@smarteverything/domain';
import { createReadStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { RunningExtension, ServerExtension } from '../extensions';
import type { MediaLinks } from '../server/media-links';
import type { RawRoute } from '../server/http-server';
import { attachment } from '../computers/file-download';
import { DONE_REPLY, bound, type ExtensionRouteTable } from '../server/router';
import { serveBytes } from '../server/file-serve';
import { MachineUpdates } from './machine-updates';
import { MachineUpdatePublisher, machineUpdateUploadRoute } from './machine-update-publication';
import { watchMachineUpdates } from './machine-update-watch';
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
      const file = params['file'];
      if (file === undefined)
        throw new ApiError('invalid_request', 'The update file name is missing.');
      const found = await updates.artifact(file);
      await serveBytes(
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

type MachineUpdateEndpointName =
  'readMachineUpdate' | 'publishMachineUpdate' | 'rollbackMachineUpdate' | 'withdrawMachineUpdate';

export function machineUpdateEndpoints(
  updates: MachineUpdates,
  publisher: MachineUpdatePublisher,
): Required<Pick<ExtensionRouteTable, MachineUpdateEndpointName>> {
  return {
    readMachineUpdate: bound(E.readMachineUpdate, ({ query }) => updates.offer(query)),
    publishMachineUpdate: bound(E.publishMachineUpdate, ({ body }) => publisher.publish(body)),
    rollbackMachineUpdate: bound(E.rollbackMachineUpdate, () => publisher.rollback()),
    withdrawMachineUpdate: bound(E.withdrawMachineUpdate, async () => {
      await publisher.withdraw();
      return DONE_REPLY;
    }),
  };
}

export function machineUpdatesExtension(): ServerExtension {
  return async (context): Promise<RunningExtension> => {
    await mkdir(dirname(context.layout.system.updates.machineUpdates), {
      recursive: true,
      mode: 0o700,
    });
    const folder = new ReleaseFolder(context.layout);
    const updates = new MachineUpdates(folder, context.links);
    const publisher = new MachineUpdatePublisher(context.layout, folder);
    const stop = watchMachineUpdates(context.layout, folder, (notice) => {
      for (const client of context.store.clients.list()) {
        if (client.platform === 'desktop') context.live.toClient(client.id, notice);
      }
    });
    return {
      endpoints: machineUpdateEndpoints(updates, publisher),
      routes: [
        machineUpdateRoute(context.links, updates),
        machineUpdateUploadRoute(context.store, publisher),
      ],
      stop,
    };
  };
}
