import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import {
  ApiError,
  hashClientToken,
  type DriveConflict,
  type DriveRoot,
} from '@smarteverything/domain';
import {
  packedToBytes,
  SYNC_HUB_MESSAGE,
  type SyncClientMessage,
  type SyncHubMessage,
  type SyncIndexEntry,
} from '@smarteverything/domain/drive-sync';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { ComputerNodeAccess } from '../../src/computers/node-access';
import { commitContent } from '../../src/drive/changes';
import { physicalRoot } from '../../src/drive/intents';
import { syncAuthentication, type SyncEnv } from '../../src/drive/sync/server-ops';
import { blocksHashOf } from '../../src/drive/sync/server-index';
import { createDriveSync, type DriveSyncParts } from '../../src/drive/sync/server-push';
import { DRIVE_SYNC_PROTOCOL, DriveSyncServer } from '../../src/drive/sync/server-socket';
import { nodeFiles, stageBytes } from '../../src/drive/versions';
import { packBlockHashes } from '../../src/store/repositories/drive-blocks';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';
import { until } from '../support/wait';
import { folderRoot } from './drive-fixture';

const NOW = new Date('2026-11-07T00:00:00.000Z');
const BLOCK = 128 * 1024;

type Push = Extract<SyncClientMessage, { readonly type: 'push' }>;
type Typed<T extends SyncHubMessage['type']> = Extract<SyncHubMessage, { type: T }>;

interface Identity {
  readonly name: string;
  readonly token: string;
  readonly clientId: string;
}

interface Client extends Identity {
  readonly socket: WebSocket;
  readonly messages: SyncHubMessage[];
}

let opened: TestStore;
let directory = '';
let server: Server;
let hub: DriveSyncServer;
let sync: DriveSyncParts;
let env: SyncEnv;
let base = '';
let wsUrl = '';
let root: DriveRoot;
let ownerId = '';
let nodeCount = 0;
let conflictRows = new Map<string, DriveConflict>();
let sockets: WebSocket[] = [];

function shaOf(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function textOf(data: WebSocket.RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return data.toString('utf8');
}

function match(pattern: RegExp, request: IncomingMessage): Record<string, string> | undefined {
  const path = new URL(request.url ?? '/', 'http://hub.test').pathname;
  return pattern.exec(`${request.method ?? ''} ${path}`)?.groups;
}

function route(request: IncomingMessage, response: ServerResponse): Promise<void> | undefined {
  const block = match(
    /^GET \/drive\/blocks\/(?<rootId>[^/]+)\/(?<itemId>[^/]+)\/(?<index>[^/]+)$/u,
    request,
  );
  if (block !== undefined) return sync.blocks.get(request, response, block);
  const put = match(/^PUT \/drive\/sync\/(?<txn>[^/]+)\/block\/(?<index>[^/]+)$/u, request);
  if (put !== undefined) return sync.blocks.put(request, response, put);
  const commit = match(/^POST \/drive\/sync\/(?<txn>[^/]+)\/commit$/u, request);
  if (commit !== undefined) return sync.commits.http(request, response, commit);
  return undefined;
}

beforeEach(async () => {
  opened = await testStore(() => NOW);
  directory = await mkdtemp(join(tmpdir(), 'drive-sync-two-'));
  ownerId = opened.store.profiles.first().id;
  conflictRows = new Map();
  sockets = [];
  env = {
    files: nodeFiles,
    store: opened.store,
    log: testLogger('drive-sync'),
    now: (): Date => NOW,
    purge: { rearm: (): void => undefined },
    conflicts: {
      insert: (conflict): void => {
        conflictRows.set(conflict.id, conflict);
      },
      find: (id): DriveConflict | undefined => conflictRows.get(id),
      resolve: (id, resolution, at): DriveConflict => {
        const found = conflictRows.get(id);
        if (found === undefined) throw new Error('missing');
        const resolved = { ...found, resolution, resolvedAt: at };
        conflictRows.set(id, resolved);
        return resolved;
      },
    },
    space: (): ReturnType<SyncEnv['space']> =>
      Promise.resolve({ totalBytes: Number.MAX_SAFE_INTEGER, freeBytes: Number.MAX_SAFE_INTEGER }),
    authenticate: (request): ReturnType<SyncEnv['authenticate']> =>
      syncAuthentication(opened.store, new ComputerNodeAccess(opened.store, () => NOW))(request),
  };
  sync = createDriveSync(env);
  hub = new DriveSyncServer(
    opened.store,
    new ComputerNodeAccess(opened.store, () => NOW),
    sync.operations,
    testLogger('drive-sync'),
  );
  server = createServer((request, response) => {
    const handled = route(request, response);
    if (handled === undefined) {
      response.writeHead(404);
      response.end();
      return;
    }
    handled.catch(() => {
      response.destroy();
    });
  });
  server.on('upgrade', (request, socket, head) => {
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
  base = `http://127.0.0.1:${String(address.port)}`;
  wsUrl = `ws://127.0.0.1:${String(address.port)}`;
  const path = join(directory, 'library');
  await mkdir(path, { recursive: true });
  root = opened.store.driveRoots.insert(
    folderRoot(randomUUID(), path, {
      readOnly: false,
      versions: true,
      synced: true,
      indexId: randomUUID(),
      sync: { ignorePatterns: [], conflictCopies: true, clients: [] },
    }),
  );
});

afterEach(async () => {
  for (const socket of sockets) socket.terminate();
  hub.stop();
  server.closeAllConnections();
  server.close();
  await opened.close();
  await rm(directory, { recursive: true, force: true });
});

function attach(identity: Identity): Promise<Client> {
  const socket = new WebSocket(wsUrl, [DRIVE_SYNC_PROTOCOL], {
    headers: { authorization: `Bearer ${identity.token}` },
  });
  sockets.push(socket);
  const messages: SyncHubMessage[] = [];
  socket.on('message', (data) => {
    messages.push(SYNC_HUB_MESSAGE.parse(JSON.parse(textOf(data))));
  });
  return new Promise<Client>((resolve, reject) => {
    socket.once('open', () => {
      resolve({ ...identity, socket, messages });
    });
    socket.once('error', reject);
  });
}

function pair(name: string): Identity {
  nodeCount += 1;
  const [device] = opened.store.devices.upsert([
    {
      provider: 'local',
      externalId: `computer:two:${String(nodeCount)}`,
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
    machineId: nodeCount.toString(16).padStart(32, '0'),
    tokenHash: createHash('sha256').update(token).digest('hex'),
    hubUrl: 'http://hub.test',
    windowClientId: null,
    profileId: ownerId,
  });
  const clientId = opened.store.clients.create(
    {
      name: name,
      platform: 'desktop',
      role: 'member',
      tokenHash: hashClientToken(`set_${randomBytes(32).toString('hex')}`),
      profileId: ownerId,
    },
    false,
  ).id;
  return { name, token, clientId };
}

async function connectAs(identity: Identity): Promise<Client> {
  const client = await attach(identity);
  client.socket.send(
    JSON.stringify({
      type: 'hello',
      clientId: client.clientId,
      rootId: root.id,
      indexId: null,
      afterSeq: 0,
    }),
  );
  await until(
    () => client.messages.some((m) => m.type === 'index' && m.last),
    `${client.name} index`,
  );
  return client;
}

function send(client: Client, message: SyncClientMessage): void {
  client.socket.send(JSON.stringify(message));
}

function bytesOf(blocks: number, fill: string): Buffer {
  return Buffer.from(fill.repeat(BLOCK * blocks - 3));
}

function pushOf(opId: string, relPath: string, baseRev: number | null, bytes: Buffer): Push {
  const hashes: string[] = [];
  for (let at = 0; at < bytes.length; at += BLOCK)
    hashes.push(shaOf(bytes.subarray(at, at + BLOCK)));
  const packed = hashes.join('');
  return {
    type: 'push',
    opId,
    relPath,
    baseRev,
    meta: {
      bytes: bytes.length,
      mtime: NOW.toISOString(),
      blockSize: BLOCK,
      blocksHash: blocksHashOf(packedToBytes(packed)),
    },
    blocks: packed,
  };
}

function isType<T extends SyncHubMessage['type']>(
  message: SyncHubMessage,
  type: T,
): message is Typed<T> {
  return message.type === type;
}

async function answer<T extends SyncHubMessage['type']>(
  client: Client,
  opId: string,
  type: T,
): Promise<Typed<T>> {
  const found = (): Typed<T> | undefined =>
    client.messages
      .filter((m): m is Typed<T> => isType(m, type))
      .find((m) => 'opId' in m && m.opId === opId);
  await until(() => found() !== undefined, `${client.name} ${type} for ${opId}`);
  const message = found();
  if (message === undefined) throw new Error('unreachable');
  return message;
}

async function upload(client: Client, need: Typed<'need_blocks'>, bytes: Buffer): Promise<void> {
  for (const index of need.indexes) {
    const response = await fetch(`${base}/drive/sync/${need.txn}/block/${String(index)}`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${client.token}` },
      body: new Uint8Array(bytes.subarray(index * BLOCK, (index + 1) * BLOCK)),
    });
    expect(response.status).toBe(204);
  }
}

interface Edit {
  readonly relPath: string;
  readonly baseRev: number | null;
  readonly bytes: Buffer;
}

async function push(
  client: Client,
  opId: string,
  { relPath, baseRev, bytes }: Edit,
): Promise<Typed<'accept'> | Typed<'conflict'>> {
  send(client, pushOf(opId, relPath, baseRev, bytes));
  const need = await answerFirst(client, opId);
  if (need.type !== 'need_blocks') return need;
  await upload(client, need, bytes);
  send(client, { type: 'commit', opId, txn: need.txn });
  const settled = await answerSettled(client, opId);
  return settled;
}

async function answerFirst(
  client: Client,
  opId: string,
): Promise<Typed<'need_blocks'> | Typed<'accept'> | Typed<'conflict'>> {
  const first = (): Typed<'need_blocks' | 'accept' | 'conflict'> | undefined =>
    client.messages.find(
      (m): m is Typed<'need_blocks' | 'accept' | 'conflict'> =>
        (m.type === 'need_blocks' || m.type === 'accept' || m.type === 'conflict') &&
        m.opId === opId,
    );
  await until(() => first() !== undefined, `${client.name} first answer for ${opId}`);
  const message = first();
  if (message === undefined) throw new Error('unreachable');
  return message;
}

async function answerSettled(
  client: Client,
  opId: string,
): Promise<Typed<'accept'> | Typed<'conflict'>> {
  const settled = (): Typed<'accept' | 'conflict'> | undefined =>
    client.messages.find(
      (m): m is Typed<'accept' | 'conflict'> =>
        (m.type === 'accept' || m.type === 'conflict') && m.opId === opId,
    );
  await until(() => settled() !== undefined, `${client.name} result for ${opId}`);
  const message = settled();
  if (message === undefined) throw new Error('unreachable');
  return message;
}

function seen(client: Client, relPath: string): SyncIndexEntry | undefined {
  return client.messages
    .flatMap((m) => (m.type === 'index' || m.type === 'index_update' ? m.entries : []))
    .filter((entry) => entry.relPath === relPath)
    .at(-1);
}

async function learns(client: Client, relPath: string, rev: number): Promise<SyncIndexEntry> {
  await until(() => (seen(client, relPath)?.rev ?? 0) >= rev, `${client.name} learns ${relPath}`);
  const entry = seen(client, relPath);
  if (entry === undefined) throw new Error('unreachable');
  return entry;
}

async function blockOf(client: Client, itemId: string, index: number): Promise<Buffer> {
  const response = await fetch(`${base}/drive/blocks/${root.id}/${itemId}/${String(index)}`, {
    headers: { authorization: `Bearer ${client.token}` },
  });
  expect(response.status).toBe(200);
  return Buffer.from(await response.arrayBuffer());
}

async function onDisk(relPath: string): Promise<Buffer> {
  return readFile(join(root.path ?? '', relPath));
}

describe('two computers on one folder', () => {
  it('shows the second computer a pushed file with its blocks, fetched and equal', async () => {
    const a = await connectAs(pair('A'));
    const b = await connectAs(pair('B'));
    const bytes = bytesOf(3, 'x');
    const accepted = await push(a, 'op-a1', { relPath: 'docs/x.bin', baseRev: null, bytes: bytes });
    if (accepted.type !== 'accept') throw new Error('expected accept');
    const entry = await learns(b, 'docs/x.bin', accepted.rev);
    if (entry.kind !== 'file') throw new Error('expected a file');
    expect(entry).toMatchObject({ rev: accepted.rev, bytes: bytes.length, deleted: false });
    const pieces = await Promise.all([0, 1, 2].map((index) => blockOf(b, entry.itemId, index)));
    expect(Buffer.concat(pieces)).toEqual(bytes);
    expect(entry.blocksHash).toBe(
      blocksHashOf(packedToBytes(pushOf('x', 'x', null, bytes).blocks)),
    );
    expect(seen(b, 'docs')?.kind).toBe('folder');
  });

  it('lands the slower edit of two based on the same rev as a conflict copy both computers see', async () => {
    const a = await connectAs(pair('A'));
    const b = await connectAs(pair('B'));
    const first = await push(a, 'op-a1', {
      relPath: 'f.txt',
      baseRev: null,
      bytes: bytesOf(1, '0'),
    });
    if (first.type !== 'accept') throw new Error('expected accept');
    await learns(b, 'f.txt', first.rev);
    const fromA = bytesOf(1, 'a');
    const fromB = bytesOf(1, 'b');
    const won = await push(a, 'op-a2', { relPath: 'f.txt', baseRev: first.rev, bytes: fromA });
    const lost = await push(b, 'op-b1', { relPath: 'f.txt', baseRev: first.rev, bytes: fromB });
    expect(won.type).toBe('accept');
    if (lost.type !== 'conflict' || lost.conflictPath === null) throw new Error('expected a copy');
    expect(lost).toMatchObject({ reason: 'stale', hubRev: first.rev + 1 });
    expect(await onDisk('f.txt')).toEqual(fromA);
    expect(await onDisk(lost.conflictPath)).toEqual(fromB);
    const copyAtA = await learns(a, lost.conflictPath, 1);
    const copyAtB = await learns(b, lost.conflictPath, 1);
    expect(copyAtA.kind).toBe('file');
    expect(copyAtB.itemId).toBe(copyAtA.itemId);
    if (copyAtB.kind !== 'file') throw new Error('expected a file');
    expect(await blockOf(a, copyAtB.itemId, 0)).toEqual(fromB);
    const winner = await learns(b, 'f.txt', first.rev + 1);
    expect(winner.rev).toBe(first.rev + 1);
  });

  it('passes a rename and a delete on as index updates', async () => {
    const a = await connectAs(pair('A'));
    const b = await connectAs(pair('B'));
    const made = await push(a, 'op-1', {
      relPath: 'one.txt',
      baseRev: null,
      bytes: bytesOf(1, 'o'),
    });
    if (made.type !== 'accept') throw new Error('expected accept');
    const original = await learns(b, 'one.txt', made.rev);
    send(a, { type: 'move', opId: 'op-2', from: 'one.txt', to: 'sub/two.txt', baseRev: made.rev });
    const moved = await answer(a, 'op-2', 'accept');
    const renamed = await learns(b, 'sub/two.txt', moved.rev);
    expect(renamed.itemId).toBe(original.itemId);
    expect(renamed.kind).toBe('file');
    send(a, { type: 'tombstone', opId: 'op-3', relPath: 'sub/two.txt', baseRev: moved.rev });
    const removed = await answer(a, 'op-3', 'accept');
    await until(
      () => seen(b, 'sub/two.txt')?.deleted === true,
      'the second computer learns the delete',
    );
    expect(seen(b, 'sub/two.txt')?.rev).toBe(removed.rev);
  });

  it('keeps an edit based on a hub commit from turning into a false conflict', async () => {
    const hubBytes = bytesOf(1, 'h');
    const writable = physicalRoot(root);
    const staged = await stageBytes(env, writable, Readable.from([hubBytes]));
    const written = await commitContent(env, {
      root: writable,
      staged,
      relPath: 'hub.txt',
      actor: { actorProfileId: ownerId, via: 'app', deviceId: null },
    });
    opened.store.driveBlocks.put({
      itemId: written.item.id,
      rev: written.item.rev,
      blockSize: BLOCK,
      hashes: packBlockHashes([createHash('sha256').update(hubBytes).digest()]),
    });
    const a = await connectAs(pair('A'));
    const b = await connectAs(pair('B'));
    const learned = await learns(a, 'hub.txt', written.item.rev);
    const edited = bytesOf(1, 'e');
    const settled = await push(a, 'op-1', {
      relPath: 'hub.txt',
      baseRev: learned.rev,
      bytes: edited,
    });
    expect(settled).toMatchObject({ type: 'accept', rev: written.item.rev + 1 });
    expect(await onDisk('hub.txt')).toEqual(edited);
    expect(conflictRows.size).toBe(0);
    await learns(b, 'hub.txt', written.item.rev + 1);
  });

  it('answers a retry after a dropped connection without applying the push twice', async () => {
    const identity = pair('A');
    let a = await connectAs(identity);
    const bytes = bytesOf(2, 'r');
    const message = pushOf('op-1', 'retry.bin', null, bytes);
    send(a, message);
    const need = await answer(a, 'op-1', 'need_blocks');
    await upload(a, need, bytes);
    a.socket.terminate();
    a = await connectAs(identity);
    send(a, message);
    const again = await answer(a, 'op-1', 'need_blocks');
    expect(again.txn).not.toBe(need.txn);
    await upload(a, again, bytes);
    send(a, { type: 'commit', opId: 'op-1', txn: again.txn });
    const settled = await answerSettled(a, 'op-1');
    expect(settled.type).toBe('accept');
    a.socket.terminate();
    a = await connectAs(identity);
    send(a, message);
    const replay = await answerFirst(a, 'op-1');
    expect(replay).toEqual(settled);
    expect(opened.store.driveItems.byPath(root.id, 'retry.bin')?.rev).toBe(1);
  });

  it('converges: both computers end with the same names, revs and bytes after interleaved work', async () => {
    const a = await connectAs(pair('A'));
    const b = await connectAs(pair('B'));
    const one = await push(a, 'a-1', {
      relPath: 'p/one.txt',
      baseRev: null,
      bytes: bytesOf(1, '1'),
    });
    const two = await push(b, 'b-1', {
      relPath: 'p/two.txt',
      baseRev: null,
      bytes: bytesOf(2, '2'),
    });
    if (one.type !== 'accept' || two.type !== 'accept') throw new Error('expected accepts');
    await learns(b, 'p/one.txt', one.rev);
    await learns(a, 'p/two.txt', two.rev);
    const edit = await push(b, 'b-2', {
      relPath: 'p/one.txt',
      baseRev: one.rev,
      bytes: bytesOf(1, 'z'),
    });
    expect(edit.type).toBe('accept');
    await learns(a, 'p/one.txt', one.rev + 1);
    const liveNames = (client: Client): readonly string[] =>
      ['p/one.txt', 'p/two.txt']
        .map((name) => seen(client, name))
        .flatMap((entry) =>
          entry === undefined || entry.deleted ? [] : [`${entry.relPath}@${String(entry.rev)}`],
        );
    expect(liveNames(a)).toEqual(liveNames(b));
    expect(liveNames(a)).toEqual([
      `p/one.txt@${String(one.rev + 1)}`,
      `p/two.txt@${String(two.rev)}`,
    ]);
  });
});
