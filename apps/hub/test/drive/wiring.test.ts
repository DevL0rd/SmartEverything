import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Duplex } from 'node:stream';
import {
  API_ENDPOINTS,
  DRIVE_LIBRARY_ENDPOINTS,
  DRIVE_STORAGE_ENDPOINTS,
  matchPath,
  type DriveBackupReport,
  type DriveBackupReportInput,
  type DriveBackupStatus,
  type DriveDataSpace,
  type DriveRoot,
  type DriveScrubState,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { ComputerNodeAccess } from '../../src/computers/node-access';
import type { DiskSpace } from '../../src/drive/data-space';
import type { WatchStatus } from '../../src/drive/watcher';
import { DriveAlbums } from '../../src/drive/service-write-albums';
import { DriveGrants } from '../../src/drive/grants';
import { DriveHealthReader } from '../../src/drive/health';
import { nodeCaller } from '../../src/drive/node-caller';
import { DrivePlacements } from '../../src/drive/placements';
import { DriveShares } from '../../src/drive/shares';
import { DriveWriteService } from '../../src/drive/service-write';
import { DriveRootLanes } from '../../src/drive/root-lanes';
import { DriveReadService } from '../../src/drive/service-read';
import { MOUNT_SUBPROTOCOL } from '@smarteverything/domain/drive-mount';
import { DRIVE_SYNC_PROTOCOL } from '../../src/drive/sync/server-socket';
import { nodeFiles } from '../../src/drive/versions';
import { CLASS2_METHODS } from '../../src/server/dav';
import { httpFailureOf } from '../../src/server/errors';
import { sendError } from '../../src/server/http';
import { driveRoutes } from '../../src/server/handlers/drive';
import { driveListings } from '../../src/server/handlers/drive-listings';
import { drivePlacementRoutes } from '../../src/server/handlers/drive-placements';
import type { DriveServices } from '../../src/server/handlers/drive-services';
import type { RawRoute } from '../../src/server/http-server';
import {
  createDriveSurfaces,
  DAV_PATH,
  MOUNT_SOCKET_PATH,
  SYNC_BLOCK_PATH,
  SYNC_COMMIT_PATH,
  SYNC_PUT_BLOCK_PATH,
  SYNC_SOCKET_PATH,
  type DriveSurfaces,
} from '../../src/server/handlers/drive-surface-routes';
import { actorOf } from '../../src/server/handlers/drive-services';
import { MediaLinks } from '../../src/server/media-links';
import { DriveActivity } from '../../src/drive/activity';
import { loadDriveSettings } from '../../src/drive/settings';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';
import { personalDriveRoot } from '../store/drive-roots-fixture';

const NOW = new Date('2026-11-07T00:00:00.000Z');
const ROOT = randomUUID();
const ITEM = randomUUID();
const TXN = randomUUID();

interface Reply {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly body: string;
}

interface Node {
  readonly token: string;
}

let opened: TestStore;
let surfaces: DriveSurfaces;
let server: Server;
let port = 0;
let nodeCount = 0;
let writes = 0;
let sockets: WebSocket[] = [];
let directory = '';

function dispatch(
  routes: readonly RawRoute[],
  request: IncomingMessage,
  response: ServerResponse,
): void {
  const { pathname } = new URL(request.url ?? '/', 'http://hub.test');
  const route = routes.find(
    (one) => one.method === request.method && matchPath(one.path, pathname) !== null,
  );
  if (route === undefined) {
    response.writeHead(404).end();
    return;
  }
  const params = matchPath(route.path, pathname) ?? {};
  route.handle(request, response, params).catch((cause: unknown) => {
    sendError(response, httpFailureOf(cause).error);
  });
}

function upgrade(
  routes: readonly RawRoute[],
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
): void {
  const { pathname } = new URL(request.url ?? '/', 'http://hub.test');
  const route = routes.find(
    (one) => one.upgrade !== undefined && matchPath(one.path, pathname) !== null,
  );
  const params = matchPath(route?.path ?? '', pathname) ?? {};
  const opening = route?.upgrade?.(request, socket, head, params);
  if (opening === undefined) {
    socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    return;
  }
  opening.catch((cause: unknown) => {
    const { error } = httpFailureOf(cause);
    socket.end(`HTTP/1.1 ${String(error.status)} Refused\r\nConnection: close\r\n\r\n`);
  });
}

function pairNode(profileId: string | null): Node {
  nodeCount += 1;
  const [device] = opened.store.devices.upsert([
    {
      provider: 'local',
      externalId: `computer:wiring:${String(nodeCount)}`,
      parentId: null,
      kind: 'computer',
      name: `Desk ${String(nodeCount)}`,
      model: 'model',
      manufacturer: 'Maker',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  if (device === undefined) throw new Error('the device was not stored');
  const token = `sen_${randomBytes(32).toString('base64url')}`;
  opened.store.computerNodes.bind({
    deviceId: device.id,
    machineId: nodeCount.toString(16).padStart(32, '0'),
    tokenHash: createHash('sha256').update(token).digest('hex'),
    hubUrl: 'http://hub.test',
    windowClientId: null,
    profileId,
  });
  return { token };
}

function myDrive(): DriveRoot {
  const { id, ...root } = personalDriveRoot(ROOT, opened.store.profiles.first().id, {
    indexId: randomUUID(),
  });
  const { path: _path, ...stored } = opened.store.driveRoots.insert({ id, ...root });
  return stored;
}

beforeEach(async () => {
  opened = await testStore(() => NOW);
  directory = await realpath(await mkdtemp(join(tmpdir(), 'drive-wiring-')));
  nodeCount = 0;
  writes = 0;
  sockets = [];
  const nodes = new ComputerNodeAccess(opened.store, () => NOW);
  const { store } = opened;
  surfaces = createDriveSurfaces({
    store,
    activity: new DriveActivity(),
    lanes: new DriveRootLanes(),
    env: {
      files: nodeFiles,
      store,
      log: testLogger('drive'),
      now: () => NOW,
      purge: { rearm: (): void => undefined },
      conflicts: {
        find: () => undefined,
      },
    },
    services: {
      read: new DriveReadService(store),
      write: {
        change: (): never => {
          writes += 1;
          throw new Error('a refused request must not reach a write');
        },
      },
      files: {
        store,
        links: new MediaLinks(() => NOW),
        nodes: {
          authenticate: (token) => nodes.authenticate(token),
          actorOf: (node) => actorOf(nodeCaller(store, node)),
        },
        now: () => NOW,
      },
      probe: {
        space: () => Promise.resolve({ totalBytes: 10 ** 12, freeBytes: 10 ** 12 }),
      },
      hasher: {
        hash: (): never => {
          throw new Error('a refused request must not hash a file');
        },
      },
    },
    nodes,
    log: testLogger('drive-sync'),
    settings: await loadDriveSettings(store),
  });
  server = createServer((request, response) => {
    dispatch(surfaces.routes, request, response);
  });
  server.on('upgrade', (request, socket, head) => {
    upgrade(surfaces.routes, request, socket, head);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  port = address.port;
});

afterEach(async () => {
  for (const socket of sockets) socket.terminate();
  surfaces.stop();
  server.closeAllConnections();
  server.close();
  await opened.close();
  await rm(directory, { recursive: true, force: true });
});

function send(
  method: string,
  path: string,
  token: string | null = null,
  extra: Record<string, string> = {},
): Promise<Reply> {
  const headers: Record<string, string> = {
    ...extra,
    ...(token === null ? {} : { authorization: `Bearer ${token}` }),
  };
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest({ host: '127.0.0.1', port, method, path, headers }, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
      incoming.on('end', () => {
        resolve({
          status: incoming.statusCode ?? 0,
          headers: incoming.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
    outgoing.on('error', reject);
    outgoing.end();
  });
}

function open(token: string | null): Promise<number> {
  const socket = new WebSocket(
    `ws://127.0.0.1:${String(port)}${SYNC_SOCKET_PATH}`,
    [DRIVE_SYNC_PROTOCOL],
    token === null ? {} : { headers: { authorization: `Bearer ${token}` } },
  );
  sockets.push(socket);
  return new Promise((resolve) => {
    socket.once('open', () => {
      resolve(101);
    });
    socket.once('unexpected-response', (_request, response) => {
      resolve(response.statusCode ?? 0);
    });
    socket.once('error', () => {
      resolve(0);
    });
  });
}

function openMount(token: string | null): Promise<number> {
  const socket = new WebSocket(
    `ws://127.0.0.1:${String(port)}${MOUNT_SOCKET_PATH}`,
    [MOUNT_SUBPROTOCOL],
    token === null ? {} : { headers: { authorization: `Bearer ${token}` } },
  );
  sockets.push(socket);
  return new Promise((resolve) => {
    socket.once('open', () => {
      resolve(101);
    });
    socket.once('unexpected-response', (_request, response) => {
      resolve(response.statusCode ?? 0);
    });
    socket.once('error', () => {
      resolve(0);
    });
  });
}

function routesOf(): string[] {
  return surfaces.routes.map((route) => route.path);
}

const fill = (pattern: string): string =>
  pattern
    .replace(':rootId', ROOT)
    .replace(':itemId', ITEM)
    .replace(':index', '0')
    .replace(':txn', TXN);

interface Call {
  readonly method: string;
  readonly path: string;
}

const SYNC_PATHS: readonly Call[] = [
  { method: 'GET', path: fill(SYNC_BLOCK_PATH) },
  { method: 'PUT', path: fill(SYNC_PUT_BLOCK_PATH) },
  { method: 'POST', path: fill(SYNC_COMMIT_PATH) },
];

const PERSON_PATHS: readonly Call[] = [
  ...CLASS2_METHODS.filter((method) => method !== 'OPTIONS').map((method) => ({
    method,
    path: `/dav/${ROOT}/folder/file.txt`,
  })),
];

const EVERY_PATH: readonly Call[] = [...SYNC_PATHS, ...PERSON_PATHS];

const REMOVED = [
  'addRoot',
  'removeRoot',
  'listVolumes',
  'listHostFolders',
  'listSyncClients',
  'updateSyncClient',
];

function driveServices(): DriveServices {
  const { store } = opened;
  const read = new DriveReadService(store);
  const nodes = new ComputerNodeAccess(store, () => NOW);
  const env = {
    files: nodeFiles,
    store,
    log: testLogger('drive'),
    now: (): Date => NOW,
    purge: { rearm: (): void => undefined },
    conflicts: {
      find: (): undefined => undefined,
    },
  };
  const albums = new DriveAlbums(store);
  const shares = new DriveShares({
    store,
    origin: (): { url: string; public: boolean } => ({ url: 'http://hub.test', public: false }),
    now: (): Date => NOW,
  });
  const space = (): Promise<DiskSpace> =>
    Promise.resolve({ totalBytes: 10 ** 12, freeBytes: 10 ** 12 });
  const dataSpace = (): Promise<DriveDataSpace> =>
    Promise.resolve({ totalBytes: 10 ** 12, freeBytes: 10 ** 12, fsType: 'ext4' });
  const idle: DriveScrubState = { state: 'idle', lastFinishedAt: null, corrupt: 0 };
  const scrub = {
    start: (): Promise<DriveScrubState> => Promise.resolve(idle),
    state: (): Promise<DriveScrubState> => Promise.resolve(idle),
  };
  const backups = {
    report: (input: DriveBackupReportInput): Promise<DriveBackupReport> =>
      store.host.write('driveBackupReport', input),
    status: (): Promise<DriveBackupStatus> => store.host.call('driveBackups', 'status'),
  };
  return {
    read,
    write: new DriveWriteService({
      env,
      store,
      read,
      albums,
      shares,
      scrub,
      backups,
      guard: { status: (profileId) => store.driveQuotas.status(profileId), space },
      scan: (): void => undefined,
      lanes: new DriveRootLanes(),
    }),
    albums,
    shares,
    scrub,
    backups,
    health: new DriveHealthReader({
      figures: (actor) => store.host.read('driveHealthFigures', { actor }),
      watcher: (): WatchStatus => ({ watching: true, unreadable: [], problem: null }),
      scrub: scrub.state,
      backup: () => backups.status(),
      space: () => Promise.resolve({ totalBytes: 10 ** 12, freeBytes: 10 ** 12, fsType: 'ext4' }),
    }),
    files: {
      store,
      links: new MediaLinks(() => NOW),
      nodes: {
        authenticate: (token) => nodes.authenticate(token),
        actorOf: (node) => actorOf(nodeCaller(store, node)),
      },
      now: (): Date => NOW,
    },
    grants: new DriveGrants({ store }),
    probe: { readMountInfo: (): Promise<string> => Promise.resolve(''), space },
    dataSpace,
    listings: driveListings({
      store,
      read,
      duplicates: { groups: () => Promise.resolve({ groups: [], next: null }) },
    }),
    hasher: {
      hash: (): never => {
        throw new Error('the route table test does not hash files');
      },
    },
  };
}

describe('Drive route table', () => {
  it('has a handler for every Drive endpoint in the registry and routes no removed or unknown one', () => {
    const { store } = opened;
    const table = {
      ...driveRoutes(store, driveServices()),
      ...drivePlacementRoutes(new DrivePlacements({ store, newId: randomUUID })),
    };
    const registered = [
      ...Object.keys(DRIVE_LIBRARY_ENDPOINTS),
      ...Object.keys(DRIVE_STORAGE_ENDPOINTS),
    ];
    const routed = Object.keys(table);
    expect(registered.filter((name) => !routed.includes(name))).toEqual([]);
    expect(routed.filter((name) => !registered.includes(name))).toEqual([]);
    for (const name of REMOVED) {
      expect(routed).not.toContain(name);
      expect(Object.keys(API_ENDPOINTS)).not.toContain(name);
    }
  });
});

describe('Drive hub wiring', () => {
  it('registers each method and path once and gives WebDAV every class 2 verb', () => {
    const keys = surfaces.routes.map((route) => `${route.method} ${route.path}`);
    expect(new Set(keys).size).toBe(keys.length);
    const dav = surfaces.routes.filter((route) => route.path === DAV_PATH);
    expect(dav.map((route) => route.method).sort()).toEqual([...CLASS2_METHODS].sort());
    expect(
      surfaces.routes.filter((route) => route.upgrade !== undefined).map((route) => route.path),
    ).toEqual([SYNC_SOCKET_PATH, MOUNT_SOCKET_PATH]);
  });

  it.each(EVERY_PATH)('answers $method $path with sign-in required', async ({ method, path }) => {
    myDrive();
    const reply = await send(method, path);
    expect(reply.status).toBe(401);
    expect(writes).toBe(0);
  });

  it('sends a WebDAV client a bearer challenge', async () => {
    const reply = await send('PROPFIND', `/dav/${ROOT}/`);
    expect(reply.headers['www-authenticate']).toContain('Bearer');
  });

  it.each(SYNC_PATHS)(
    'treats a computer that is not paired for a person as signed out on $method $path',
    async ({ method, path }) => {
      myDrive();
      const reply = await send(method, path, pairNode(null).token);
      expect(reply.status).toBe(401);
    },
  );

  it.each(PERSON_PATHS)(
    'refuses $method $path for a computer that is not paired for a person',
    async ({ method, path }) => {
      myDrive();
      const reply = await send(method, path, pairNode(null).token);
      expect(reply.status).toBe(403);
      expect(writes).toBe(0);
    },
  );

  it('answers OPTIONS on the DAV root with the class 2 verbs and no sign-in', async () => {
    for (const path of ['/dav', '/dav/', `/dav/${ROOT}/`, `/dav/${ROOT}/a/b`]) {
      const reply = await send('OPTIONS', path);
      expect(reply.status).toBe(200);
      expect(reply.headers['dav']).toBe('1, 2');
      expect(String(reply.headers['allow']).split(/,\s*/u).sort()).toEqual(
        [...CLASS2_METHODS].sort(),
      );
    }
  });

  it.each([
    { method: 'GET', path: `/drive/fs/${ROOT}/list` },
    { method: 'GET', path: `/drive/fs/${ROOT}/stat?path=a` },
    { method: 'GET', path: `/drive/fs/${ROOT}/read/${ITEM}` },
    { method: 'POST', path: `/drive/fs/${ROOT}/mkdir` },
    { method: 'POST', path: `/drive/fs/${ROOT}/rename` },
    { method: 'POST', path: `/drive/fs/${ROOT}/unlink` },
    { method: 'POST', path: `/drive/fs/${ROOT}/rmdir` },
    { method: 'POST', path: `/drive/fs/${ROOT}/utimens` },
    { method: 'GET', path: `/drive/fs/${ROOT}/space` },
  ])('no longer serves $method $path for a paired computer', async ({ method, path }) => {
    myDrive();
    const owner = opened.store.profiles.first().id;
    const reply = await send(method, path, pairNode(owner).token);
    expect(reply.status).toBe(404);
    expect(routesOf()).not.toContain(path.split('?')[0]);
  });

  it('serves a DAV PROPFIND on a root for a paired computer', async () => {
    myDrive();
    const owner = opened.store.profiles.first().id;
    const reply = await send('PROPFIND', `/dav/${ROOT}/`, pairNode(owner).token, { depth: '0' });
    expect(reply.status).toBe(207);
  });

  it('refuses a plain request to the mount socket address', async () => {
    const reply = await send('GET', MOUNT_SOCKET_PATH);
    expect(reply.status).toBe(400);
  });

  it('upgrades the mount socket for a paired computer and refuses everything else', async () => {
    const owner = opened.store.profiles.first().id;
    expect(await openMount(pairNode(owner).token)).toBe(101);
    expect(await openMount(null)).toBe(401);
    expect(await openMount(pairNode(null).token)).not.toBe(101);
  });

  it('refuses a mount socket opened without its subprotocol', async () => {
    const owner = opened.store.profiles.first().id;
    const socket = new WebSocket(
      `ws://127.0.0.1:${String(port)}${MOUNT_SOCKET_PATH}`,
      [DRIVE_SYNC_PROTOCOL],
      {
        headers: { authorization: `Bearer ${pairNode(owner).token}` },
      },
    );
    sockets.push(socket);
    const status = await new Promise<number>((resolve) => {
      socket.once('open', () => {
        resolve(101);
      });
      socket.once('unexpected-response', (_request, response) => {
        resolve(response.statusCode ?? 0);
      });
      socket.once('error', () => {
        resolve(0);
      });
    });
    expect(status).not.toBe(101);
  });

  it('refuses a plain request to the sync socket address', async () => {
    const reply = await send('GET', SYNC_SOCKET_PATH);
    expect(reply.status).toBe(400);
  });

  it('upgrades the sync socket for a paired computer and refuses everything else', async () => {
    const owner = opened.store.profiles.first().id;
    expect(await open(pairNode(owner).token)).toBe(101);
    expect(await open(null)).toBe(401);
    expect(await open(pairNode(null).token)).not.toBe(101);
  });
});
