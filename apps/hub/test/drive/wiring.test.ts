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
import { matchPath, type DriveRoot } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { ComputerNodeAccess } from '../../src/computers/node-access';
import { nodeCaller } from '../../src/drive/node-caller';
import { DriveReadService } from '../../src/drive/service-read';
import { DRIVE_SYNC_PROTOCOL } from '../../src/drive/sync/server-socket';
import { nodeFiles } from '../../src/drive/versions';
import { CLASS2_METHODS } from '../../src/server/dav';
import { httpFailureOf } from '../../src/server/errors';
import { sendError } from '../../src/server/http';
import type { RawRoute } from '../../src/server/http-server';
import {
  createDriveSurfaces,
  DAV_PATH,
  SYNC_BLOCK_PATH,
  SYNC_COMMIT_PATH,
  SYNC_PUT_BLOCK_PATH,
  SYNC_SOCKET_PATH,
  type DriveSurfaces,
} from '../../src/server/handlers/drive-surface-routes';
import { actorOf } from '../../src/server/handlers/drive-services';
import { MediaLinks } from '../../src/server/media-links';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';
import { folderRoot } from './drive-fixture';

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

function syncedRoot(): DriveRoot {
  return opened.store.driveRoots.insert(
    folderRoot(ROOT, directory, {
      readOnly: false,
      synced: true,
      indexId: randomUUID(),
      sync: { ignorePatterns: [], conflictCopies: true, clients: [] },
    }),
  );
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
    env: {
      files: nodeFiles,
      store,
      log: testLogger('drive'),
      now: () => NOW,
      purge: { rearm: (): void => undefined },
      conflicts: {
        insert: (): void => undefined,
        find: () => undefined,
        resolve: (): never => {
          throw new Error('unused');
        },
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
          actorOf: (node) => actorOf(store, nodeCaller(store, node)),
        },
        now: () => NOW,
      },
      probe: {
        space: () => Promise.resolve({ totalBytes: 10 ** 12, freeBytes: 10 ** 12 }),
      },
    },
    nodes,
    log: testLogger('drive-sync'),
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
  { method: 'GET', path: `/drive/fs/${ROOT}/list` },
  { method: 'GET', path: `/drive/fs/${ROOT}/stat?path=a` },
  { method: 'GET', path: `/drive/fs/${ROOT}/read/${ITEM}` },
  { method: 'POST', path: `/drive/fs/${ROOT}/mkdir` },
  { method: 'POST', path: `/drive/fs/${ROOT}/rename` },
  { method: 'POST', path: `/drive/fs/${ROOT}/unlink` },
  { method: 'POST', path: `/drive/fs/${ROOT}/rmdir` },
  { method: 'POST', path: `/drive/fs/${ROOT}/utimens` },
  ...CLASS2_METHODS.filter((method) => method !== 'OPTIONS').map((method) => ({
    method,
    path: `/dav/${ROOT}/folder/file.txt`,
  })),
];

const EVERY_PATH: readonly Call[] = [...SYNC_PATHS, ...PERSON_PATHS];

describe('Drive hub wiring', () => {
  it('registers each method and path once and gives WebDAV every class 2 verb', () => {
    const keys = surfaces.routes.map((route) => `${route.method} ${route.path}`);
    expect(new Set(keys).size).toBe(keys.length);
    const dav = surfaces.routes.filter((route) => route.path === DAV_PATH);
    expect(dav.map((route) => route.method).sort()).toEqual([...CLASS2_METHODS].sort());
    expect(surfaces.routes.filter((route) => route.upgrade !== undefined)).toHaveLength(1);
  });

  it.each(EVERY_PATH)('answers $method $path with sign-in required', async ({ method, path }) => {
    syncedRoot();
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
      syncedRoot();
      const reply = await send(method, path, pairNode(null).token);
      expect(reply.status).toBe(401);
    },
  );

  it.each(PERSON_PATHS)(
    'refuses $method $path for a computer that is not paired for a person',
    async ({ method, path }) => {
      syncedRoot();
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

  it('lists a synced root through the mount API for a paired computer', async () => {
    syncedRoot();
    const owner = opened.store.profiles.first().id;
    const reply = await send('GET', `/drive/fs/${ROOT}/list`, pairNode(owner).token);
    expect(reply.status).toBe(200);
    expect(JSON.parse(reply.body)).toMatchObject({ entries: [], next: null });
  });

  it('serves a DAV PROPFIND on a root for a paired computer', async () => {
    syncedRoot();
    const owner = opened.store.profiles.first().id;
    const reply = await send('PROPFIND', `/dav/${ROOT}/`, pairNode(owner).token, { depth: '0' });
    expect(reply.status).toBe(207);
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
