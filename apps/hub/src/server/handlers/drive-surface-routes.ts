import type { Logger } from '@smarteverything/logging';
import { ApiError } from '@smarteverything/domain';
import type { ConflictEnv } from '../../drive/conflicts';
import { DriveFsApi } from '../../drive/fs-api';
import { createDriveSync } from '../../drive/sync/server-push';
import { syncAuthentication, type SyncEnv } from '../../drive/sync/server-ops';
import { DriveSyncServer } from '../../drive/sync/server-socket';
import type { DriveReadService } from '../../drive/service-read';
import type { DriveWriteService } from '../../drive/service-write';
import type { DataSpaceProbe } from '../../drive/data-space';
import type { ComputerNodeAccess } from '../../computers/node-access';
import type { Store } from '../../store/store';
import { CLASS2_METHODS, createDavHandler } from '../dav';
import type { DavDeps } from '../dav/dav-auth';
import type { DriveFiles } from '../drive-files';
import { driveFsRoutes } from '../drive-fs-route';
import type { RawRoute } from '../http-server';

export const SYNC_SOCKET_PATH = '/drive/sync';
export const SYNC_BLOCK_PATH = '/drive/blocks/:rootId/:itemId/:index';
export const SYNC_PUT_BLOCK_PATH = '/drive/sync/:txn/block/:index';
export const SYNC_COMMIT_PATH = '/drive/sync/:txn/commit';
export const DAV_PATH = '/dav/*path';

export interface DriveSurfaceServices {
  readonly read: DriveReadService;
  readonly write: Pick<DriveWriteService, 'change'>;
  readonly files: DriveFiles;
  readonly probe: Pick<DataSpaceProbe, 'space'>;
}

export interface DriveSurfaceInputs {
  readonly store: Store;
  readonly env: ConflictEnv;
  readonly services: DriveSurfaceServices;
  readonly nodes: ComputerNodeAccess;
  readonly log: Logger;
}

export interface DriveSurfaces {
  readonly routes: readonly RawRoute[];
  readonly revoke: (deviceId: string) => void;
  readonly stop: () => void;
}

function syncEnvOf(inputs: DriveSurfaceInputs): SyncEnv {
  const { store, nodes, services } = inputs;
  return {
    ...inputs.env,
    store,
    space: services.probe.space,
    authenticate: syncAuthentication(store, nodes),
  };
}

function davDepsOf(inputs: DriveSurfaceInputs): DavDeps {
  const { store, services } = inputs;
  return {
    store,
    env: inputs.env,
    guard: {
      status: (profileId) => store.driveQuotas.status(profileId),
      space: services.probe.space,
    },
    nodes: services.files.nodes,
  };
}

function davRoutes(deps: DavDeps): readonly RawRoute[] {
  const handler = createDavHandler(deps);
  // DAV verbs (PROPFIND, MKCOL, ...) are matched as plain strings by the raw
  // route server, whose RawRoute method union only names the REST verbs.
  return CLASS2_METHODS.map((method): RawRoute => ({
    method: method as RawRoute['method'],
    path: DAV_PATH,
    handle: (request, response): Promise<void> => handler({ request, response }),
  }));
}

function syncRoutes(
  server: DriveSyncServer,
  parts: ReturnType<typeof createDriveSync>,
): readonly RawRoute[] {
  const { blocks, commits } = parts;
  return [
    {
      method: 'GET',
      path: SYNC_SOCKET_PATH,
      handle: () =>
        Promise.reject(new ApiError('invalid_request', 'Open this address as a WebSocket.')),
      upgrade: (request, socket, head): Promise<void> =>
        new Promise((resolve) => {
          server.upgrade(request, socket, head);
          resolve();
        }),
    },
    {
      method: 'GET',
      path: SYNC_BLOCK_PATH,
      handle: (request, response, params) => blocks.get(request, response, params),
    },
    {
      method: 'PUT',
      path: SYNC_PUT_BLOCK_PATH,
      handle: (request, response, params) => blocks.put(request, response, params),
    },
    {
      method: 'POST',
      path: SYNC_COMMIT_PATH,
      handle: (request, response, params) => commits.http(request, response, params),
    },
  ];
}

export function createDriveSurfaces(inputs: DriveSurfaceInputs): DriveSurfaces {
  const { store, services } = inputs;
  const parts = createDriveSync(syncEnvOf(inputs));
  const server = new DriveSyncServer(store, inputs.nodes, parts.operations, inputs.log);
  const fs = new DriveFsApi({
    env: inputs.env,
    store,
    read: services.read,
    write: services.write,
    ops: store.driveSyncOps,
  });
  return {
    routes: [
      ...syncRoutes(server, parts),
      ...driveFsRoutes({ api: fs, files: services.files }),
      ...davRoutes(davDepsOf(inputs)),
    ],
    revoke: (deviceId): void => {
      server.revoke(deviceId);
    },
    stop: (): void => {
      server.stop();
    },
  };
}
