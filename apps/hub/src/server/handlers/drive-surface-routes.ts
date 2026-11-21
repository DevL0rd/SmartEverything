import type { Logger } from '@smarteverything/logging';
import { ApiError, type DriveSettings } from '@smarteverything/domain';
import type { ConflictEnv } from '../../drive/conflicts';
import { nodeInodeProbe } from '../../drive/fs-space';
import type { DriveActivity } from '../../drive/activity';
import type { DriveRootLanes } from '../../drive/root-lanes';
import { DriveMount } from '../../drive/mount/service';
import { DriveMountSocket } from '../../drive/mount/socket';
import { createDriveSync } from '../../drive/sync/server-push';
import { syncAuthentication, type SyncEnv } from '../../drive/sync/server-ops';
import { DriveSyncServer } from '../../drive/sync/server-socket';
import type { DriveReadService } from '../../drive/service-read';
import type { DriveWriteService } from '../../drive/service-write';
import type { DataSpaceProbe } from '../../drive/data-space';
import type { ContentHasher } from '../../drive/hasher';
import type { ComputerNodeAccess } from '../../computers/node-access';
import type { Store } from '../../store/store';
import { fileIoThreadsStart } from '../../service/file-io-threads';
import { CLASS2_METHODS, createDavHandler } from '../dav';
import type { DavDeps } from '../dav/dav-auth';
import type { DriveFiles } from '../drive-files';
import type { RawRoute } from '../http-server';

export const SYNC_SOCKET_PATH = '/drive/sync';
export const MOUNT_SOCKET_PATH = '/drive/mount';
export const SYNC_BLOCK_PATH = '/drive/blocks/:rootId/:itemId/:index';
export const SYNC_PUT_BLOCK_PATH = '/drive/sync/:txn/block/:index';
export const SYNC_COMMIT_PATH = '/drive/sync/:txn/commit';
export const DAV_PATH = '/dav/*path';

export interface DriveSurfaceServices {
  readonly read: DriveReadService;
  readonly write: Pick<DriveWriteService, 'change'>;
  readonly files: DriveFiles;
  readonly probe: Pick<DataSpaceProbe, 'space'>;
  readonly hasher: Pick<ContentHasher, 'hash'>;
}

export interface DriveSurfaceInputs {
  readonly store: Store;
  readonly activity: DriveActivity;
  readonly lanes: DriveRootLanes;
  readonly env: ConflictEnv;
  readonly services: DriveSurfaceServices;
  readonly nodes: ComputerNodeAccess;
  readonly log: Logger;
  readonly settings: DriveSettings;
}

export interface DriveSurfaces {
  readonly routes: readonly RawRoute[];
  readonly revoke: (deviceId: string) => void;
  readonly stop: () => void;
}

function syncEnvOf(inputs: DriveSurfaceInputs, posix: SyncEnv['posix']): SyncEnv {
  const { store, nodes, services } = inputs;
  return {
    ...inputs.env,
    store,
    posix,
    space: services.probe.space,
    hasher: services.hasher,
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
  return CLASS2_METHODS.map((method): RawRoute => ({
    method,
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
      upgrade: (request, socket, head): Promise<void> => server.upgrade(request, socket, head),
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

function mountEnvOf(inputs: DriveSurfaceInputs): ConstructorParameters<typeof DriveMount>[0] {
  const { store, services } = inputs;
  const quota = (profileId: string): ReturnType<typeof store.driveQuotas.status> =>
    store.driveQuotas.status(profileId);
  return {
    store,
    change: { ...inputs.env, store },
    guard: { status: quota, space: services.probe.space },
    space: { read: services.read, quota, probe: services.probe, inodes: nodeInodeProbe },
    activity: inputs.activity,
    lanes: inputs.lanes,
    log: inputs.log,
    settings: inputs.settings,
  };
}

function mountRoute(socket: DriveMountSocket): RawRoute {
  return {
    method: 'GET',
    path: MOUNT_SOCKET_PATH,
    handle: () =>
      Promise.reject(new ApiError('invalid_request', 'Open this address as a WebSocket.')),
    upgrade: (request, connection, head): Promise<void> =>
      socket.upgrade(request, connection, head),
  };
}

export function createDriveSurfaces(inputs: DriveSurfaceInputs): DriveSurfaces {
  const { store } = inputs;
  const mount = new DriveMount(mountEnvOf(inputs));
  const parts = createDriveSync(syncEnvOf(inputs, mount.services.posix));
  const server = new DriveSyncServer(store, inputs.nodes, parts.operations, inputs.log);
  const mountSocket = new DriveMountSocket(store, inputs.nodes, mount, {
    log: inputs.log,
    writeSlots: (): number => fileIoThreadsStart().threads,
  });
  return {
    routes: [
      ...syncRoutes(server, parts),
      mountRoute(mountSocket),
      ...davRoutes(davDepsOf(inputs)),
    ],
    revoke: (deviceId): void => {
      server.revoke(deviceId);
      mountSocket.revoke(deviceId);
    },
    stop: (): void => {
      server.stop();
      mountSocket.stop();
      mount.stop();
    },
  };
}
