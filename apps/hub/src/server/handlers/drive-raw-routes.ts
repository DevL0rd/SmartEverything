import { MEDIA_PATHS } from '@smarteverything/domain';
import { UPLOADS_PATH } from '../../drive/uploads-tus-wire';
import { serveDriveDerived } from '../drive-derived';
import { serveDriveFile } from '../drive-files';
import type { RawRoute } from '../http-server';
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

export function driveRawRoutes(
  deps: DriveDeps,
  runtime: DriveRuntime,
  sweeper: UploadSweeper,
): readonly RawRoute[] {
  return [
    ...uploadRoutes(runtime, sweeper),
    fileRoute(runtime),
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
