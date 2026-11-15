import { MEDIA_PATHS } from '@smarteverything/domain';
import { serveFolderIcon } from '../../drive/content/folder-icon/icon-route';
import { serveZipEntry } from '../../drive/content/zip-entry-route';
import { UPLOADS_PATH } from '../../drive/uploads-tus-wire';
import { serveDriveDerived } from '../drive-derived';
import { serveDriveFile, type DriveExchange } from '../drive-files';
import { fileRequestRoutes } from '../file-request-route';
import type { RawRoute } from '../http-server';
import { driveDownloadRawRoute } from './drive-download';
import { shareRoutes } from '../share-route';
import type { DriveDeps, DriveRuntime } from './drive-wiring';
import type { UploadSweeper } from './drive-upload-sweep';

function uploadRoutes(runtime: DriveRuntime, sweeper: UploadSweeper): readonly RawRoute[] {
  const handle: RawRoute['handle'] = async (request, response) => {
    await runtime.uploads.handle(request, response);
    sweeper.rearm();
  };
  const item = `${UPLOADS_PATH}/:uploadId`;
  return [
    { method: 'POST', path: UPLOADS_PATH, handle },
    { method: 'HEAD', path: item, handle },
    { method: 'PATCH', path: item, handle },
    { method: 'DELETE', path: item, handle },
  ];
}

function fileRoute(runtime: DriveRuntime): RawRoute {
  return {
    method: 'GET',
    path: MEDIA_PATHS.driveFile,
    handle: (request, response, params) =>
      serveDriveFile(
        runtime.services.files,
        { request, response, url: new URL(request.url ?? '/', 'http://drive') },
        params['itemId'] ?? '',
      ),
  };
}

function exchangeOf(
  request: Parameters<RawRoute['handle']>[0],
  response: Parameters<RawRoute['handle']>[1],
): DriveExchange {
  return { request, response, url: new URL(request.url ?? '/', 'http://drive') };
}

function contentRoutes(runtime: DriveRuntime): readonly RawRoute[] {
  const { extras } = runtime;
  return [
    {
      method: 'GET',
      path: MEDIA_PATHS.driveZipEntry,
      handle: (request, response, params) =>
        serveZipEntry(extras.zipServing, exchangeOf(request, response), {
          itemId: params['itemId'] ?? '',
          index: params['index'] ?? '',
        }),
    },
    {
      method: 'GET',
      path: MEDIA_PATHS.driveFolderIcon,
      handle: (request, response, params) =>
        serveFolderIcon(extras.iconServing, exchangeOf(request, response), params['itemId'] ?? ''),
    },
    ...fileRequestRoutes({ requests: extras.requests, intake: extras.intake }),
  ];
}

export function driveRawRoutes(
  deps: DriveDeps,
  runtime: DriveRuntime,
  sweeper: UploadSweeper,
): readonly RawRoute[] {
  return [
    ...uploadRoutes(runtime, sweeper),
    fileRoute(runtime),
    driveDownloadRawRoute(deps.links, runtime.extras.downloads),
    ...contentRoutes(runtime),
    {
      method: 'GET',
      path: MEDIA_PATHS.driveThumb,
      handle: (request, response, params) =>
        serveDriveDerived(
          deps,
          runtime.media,
          { request, response, url: new URL(request.url ?? '/', 'http://drive') },
          { itemId: params['itemId'] ?? '', size: params['size'] ?? '' },
        ),
    },
    ...shareRoutes({
      shares: runtime.services.shares,
      layout: deps.layout,
      removeLocationOutside: deps.parts.removeLocationOutside,
    }),
  ];
}
