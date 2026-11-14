import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ApiError, type DriveConflict, type DrivePlacementSet } from '@smarteverything/domain';
import { Logger, messageOf } from '@smarteverything/logging';
import WebSocket from 'ws';
import { ComputerNodeAccess } from '../../../hub/src/computers/node-access';
import { nodeFiles } from '../../../hub/src/drive/versions';
import { syncAuthentication, type SyncEnv } from '../../../hub/src/drive/sync/server-ops';
import { createDriveSync, type DriveSyncParts } from '../../../hub/src/drive/sync/server-push';
import { DriveSyncServer } from '../../../hub/src/drive/sync/server-socket';
import { status } from '../../../hub/test/drive/placement-fixture';
import { driveTestStore } from '../../../hub/test/drive/spaces-fixture';
import { testLogger } from '../../../hub/test/support/logs';
import type { TestStore } from '../../../hub/test/support/store';
import { sharedDriveRoot } from '../../../hub/test/store/drive-roots-fixture';
import type { StoredDrive } from '../../../hub/src/store/repositories/drive-roots';
import type { SyncSocketTransport } from '../../src/drive-sync/socket.js';

const NOW = new Date('2026-11-07T00:00:00.000Z');

const log = new Logger('desktop.drive-sync');

export interface HubPeer {
  readonly name: string;
  readonly token: string;
  readonly deviceId: string;
  readonly placementId: string;
}

export type PeerPlacement = Partial<
  Pick<DrivePlacementSet, 'folderItemId'> & {
    readonly excluded: readonly string[];
    readonly ignorePatterns: readonly string[];
    readonly conflictCopies: boolean;
    readonly readOnly: boolean;
  }
>;

export interface FakeHub {
  readonly store: TestStore['store'];
  readonly url: string;
  readonly driveId: string;
  readonly ownerId: string;
  readonly rootPath: string;
  readonly upgrades: () => number;
  readonly peer: (name: string, placement?: PeerPlacement) => HubPeer;
  readonly revoke: (deviceId: string) => void;
  readonly dropSockets: () => void;
  readonly itemRev: (relPath: string) => number | undefined;
  readonly readFile: (relPath: string) => Promise<Buffer>;
  readonly stop: () => Promise<void>;
}

export class TestTransport implements SyncSocketTransport {
  readonly sockets: WebSocket[] = [];
  readonly #listeners = new Set<() => void>();
  readyNow = true;

  readonly socket: SyncSocketTransport['socket'] = (url, protocols, options) => {
    const created = new WebSocket(url, protocols, options);
    this.sockets.push(created);
    return created;
  };

  readonly subscribe: SyncSocketTransport['subscribe'] = (listener) => {
    this.#listeners.add(listener);
    return (): void => {
      this.#listeners.delete(listener);
    };
  };

  readonly ready: SyncSocketTransport['ready'] = () => this.readyNow;

  routeChanged(): void {
    for (const listener of this.#listeners) listener();
  }

  closeAll(): void {
    for (const socket of this.sockets) socket.terminate();
  }
}

function match(pattern: RegExp, request: IncomingMessage): Record<string, string> | undefined {
  const path = new URL(request.url ?? '/', 'http://hub.test').pathname;
  return pattern.exec(`${request.method ?? ''} ${path}`)?.groups;
}

function routeOf(
  sync: DriveSyncParts,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> | undefined {
  const put = match(/^PUT \/drive\/sync\/(?<txn>[^/]+)\/block\/(?<index>[^/]+)$/u, request);
  if (put !== undefined) return sync.blocks.put(request, response, put);
  const commit = match(/^POST \/drive\/sync\/(?<txn>[^/]+)\/commit$/u, request);
  if (commit !== undefined) return sync.commits.http(request, response, commit);
  return undefined;
}

function syncEnv(opened: TestStore, conflicts: Map<string, DriveConflict>): SyncEnv {
  return {
    files: nodeFiles,
    store: opened.store,
    log: testLogger('drive-sync'),
    now: (): Date => NOW,
    purge: { rearm: (): void => undefined },
    conflicts: {
      insert: (conflict): void => {
        conflicts.set(conflict.id, conflict);
      },
      find: (id): DriveConflict | undefined => conflicts.get(id),
      resolve: (id, resolution, at): DriveConflict => {
        const found = conflicts.get(id);
        if (found === undefined) throw new Error('missing');
        const resolved = { ...found, resolution, resolvedAt: at };
        conflicts.set(id, resolved);
        return resolved;
      },
    },
    space: (): ReturnType<SyncEnv['space']> =>
      Promise.resolve({ totalBytes: Number.MAX_SAFE_INTEGER, freeBytes: Number.MAX_SAFE_INTEGER }),
    authenticate: (request): ReturnType<SyncEnv['authenticate']> =>
      syncAuthentication(opened.store, new ComputerNodeAccess(opened.store, () => NOW))(request),
  };
}

interface PeerWorld {
  readonly opened: TestStore;
  readonly drive: StoredDrive;
  readonly ownerId: string;
}

function pairedComputer(
  { opened, ownerId }: PeerWorld,
  name: string,
  count: number,
): { readonly deviceId: string; readonly token: string } {
  const [device] = opened.store.devices.upsert([
    {
      provider: 'local',
      externalId: `computer:harness:${String(count)}`,
      parentId: null,
      kind: 'computer',
      name,
      model: 'model',
      manufacturer: 'Maker',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: { os: 'CachyOS' },
    },
  ]);
  if (device === undefined) throw new Error('the device was not stored');
  const token = `sen_${randomBytes(32).toString('base64url')}`;
  opened.store.computerNodes.bind({
    deviceId: device.id,
    machineId: count.toString(16).padStart(32, '0'),
    tokenHash: createHash('sha256').update(token).digest('hex'),
    hubUrl: 'http://hub.test',
    windowClientId: null,
    profileId: ownerId,
  });
  return { deviceId: device.id, token };
}

function peerOn(world: PeerWorld, name: string, count: number, placement: PeerPlacement): HubPeer {
  const { deviceId, token } = pairedComputer(world, name, count);
  const placed = world.opened.store.drivePlacements.insert({
    id: randomUUID(),
    deviceId,
    rootId: world.drive.id,
    folderItemId: placement.folderItemId ?? null,
    mode: 'synced',
    localPath: `/sync/${name}`,
    enabled: true,
    createdBy: world.ownerId,
    excluded: placement.excluded ?? [],
    ignorePatterns: placement.ignorePatterns ?? [],
    conflictCopies: placement.conflictCopies ?? true,
    status: status({
      state: 'starting',
      tier: null,
      route: null,
      readOnly: placement.readOnly ?? false,
    }),
  });
  return { name, token, deviceId, placementId: placed.id };
}

export async function until(
  condition: () => boolean | Promise<boolean>,
  label = 'the awaited condition',
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}.`);
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

interface Listening {
  readonly server: Server;
  readonly sockets: Set<Duplex>;
  readonly upgrades: () => number;
  readonly url: string;
}

async function listen(sync: DriveSyncParts, hub: DriveSyncServer): Promise<Listening> {
  const sockets = new Set<Duplex>();
  let upgrades = 0;
  const server = createServer((request, response) => {
    const handled = routeOf(sync, request, response);
    if (handled === undefined) {
      response.writeHead(404);
      response.end();
      return;
    }
    handled.catch((cause: unknown) => {
      log.warn('test.hub_route_failed', { error: messageOf(cause) });
      response.destroy();
    });
  });
  server.on('upgrade', (request, socket, head) => {
    upgrades += 1;
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    try {
      hub.upgrade(request, socket, head);
    } catch (cause) {
      if (!(cause instanceof ApiError)) throw cause;
      socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
    }
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  return {
    server,
    sockets,
    upgrades: () => upgrades,
    url: `http://127.0.0.1:${String(address.port)}`,
  };
}

async function sharedDrive(opened: TestStore): Promise<StoredDrive> {
  const drive = opened.store.driveRoots.insert(sharedDriveRoot(randomUUID()));
  await mkdir(drive.path, { recursive: true });
  return drive;
}

export async function startFakeHub(): Promise<FakeHub> {
  const opened = await driveTestStore(() => NOW);
  const ownerId = opened.store.profiles.first().id;
  const sync = createDriveSync(syncEnv(opened, new Map()));
  const hub = new DriveSyncServer(
    opened.store,
    new ComputerNodeAccess(opened.store, () => NOW),
    sync.operations,
    testLogger('drive-sync'),
  );
  const listening = await listen(sync, hub);
  const root = await sharedDrive(opened);
  const rootPath = root.path;
  let count = 0;
  return {
    store: opened.store,
    url: listening.url,
    driveId: root.id,
    ownerId,
    rootPath,
    upgrades: listening.upgrades,
    peer: (name, placement = {}): HubPeer => {
      count += 1;
      return peerOn({ opened, drive: root, ownerId }, name, count, placement);
    },
    revoke: (deviceId): void => {
      hub.revoke(deviceId);
    },
    dropSockets: (): void => {
      for (const socket of listening.sockets) socket.destroy();
    },
    itemRev: (relPath): number | undefined =>
      opened.store.driveItems.byPath(root.id, relPath, ownerId)?.rev,
    readFile: (relPath): Promise<Buffer> => readFile(join(rootPath, relPath)),
    stop: async (): Promise<void> => {
      for (const socket of listening.sockets) socket.destroy();
      hub.stop();
      listening.server.closeAllConnections();
      listening.server.close();
      await opened.close();
    },
  };
}
