import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import {
  type ComputerNodeRow,
  type DriveConflict,
  type DriveItem,
  type DrivePlacement,
} from '@smarteverything/domain';
import {
  packedToBytes,
  SYNC_HUB_MESSAGE,
  type SyncHubMessage,
} from '@smarteverything/domain/drive-sync';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ComputerNodeAccess } from '../../src/computers/node-access';
import { commitContent } from '../../src/drive/changes';
import { TMP_DIRECTORY } from '../../src/drive/intents';
import { createDriveSync, type DriveSyncParts } from '../../src/drive/sync/server-push';
import { syncAuthentication, type SyncEnv } from '../../src/drive/sync/server-ops';
import type { SyncOperation, SyncSession } from '../../src/drive/sync/server-socket';
import { commitTrash } from '../../src/drive/trash-purge';
import { nodeFiles, stageBytes } from '../../src/drive/versions';
import { testLogger } from '../support/logs';
import type { StoredDrive } from '../../src/store/repositories/drive-roots';
import { personalDriveRoot, sharedDriveRoot } from '../store/drive-roots-fixture';
import type { TestStore } from '../support/store';
import { status } from './placement-fixture';
import { driveTestStore, putItem } from './spaces-fixture';

const NOW = new Date('2026-11-07T00:00:00.000Z');
const BLOCK = 128 * 1024;
const HUB_ACTOR = { actorProfileId: null, via: 'app', deviceId: null } as const;

type Push = Extract<SyncOperation, { readonly type: 'push' }>;
type Typed<T extends SyncHubMessage['type']> = Extract<SyncHubMessage, { type: T }>;

interface Peer {
  readonly token: string;
  readonly row: ComputerNodeRow;
  readonly profileId: string;
  readonly sent: SyncHubMessage[];
  readonly placements: Map<string, string>;
  readonly session: (rootId: string) => SyncSession;
}

let opened: TestStore;
let directory = '';
let server: Server;
let base = '';
let sync: DriveSyncParts;
let env: SyncEnv;
let ownerId = '';
let samId = '';
let owner: Peer;
let laptop: Peer;
let sam: Peer;
let nodeCount = 0;
let conflictRows = new Map<string, DriveConflict>();
let free = Number.MAX_SAFE_INTEGER;

function shaOf(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
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

function listen(): Promise<void> {
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
  return new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  }).then(() => {
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('no port');
    base = `http://127.0.0.1:${String(address.port)}`;
  });
}

function peerFor(profileId: string, os = 'CachyOS'): Peer {
  nodeCount += 1;
  const [device] = opened.store.devices.upsert([
    {
      provider: 'local',
      externalId: `computer:push:${String(nodeCount)}`,
      parentId: null,
      kind: 'computer',
      name: `Desk ${String(nodeCount)}`,
      model: 'model',
      manufacturer: 'Maker',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: { os },
    },
  ]);
  if (device === undefined) throw new Error('the device was not stored');
  const token = `sen_${randomBytes(32).toString('base64url')}`;
  const tokenHash = createHash('sha256').update(token).digest('hex');
  opened.store.computerNodes.bind({
    deviceId: device.id,
    machineId: nodeCount.toString(16).padStart(32, '0'),
    tokenHash,
    hubUrl: 'http://hub.test',
    windowClientId: null,
    profileId,
  });
  const row = opened.store.computerNodes.byToken(tokenHash);
  if (row === undefined) throw new Error('the node was not stored');
  const sent: SyncHubMessage[] = [];
  const placements = new Map<string, string>();
  const peer: Peer = {
    token,
    row,
    profileId,
    sent,
    placements,
    session: (rootId) => ({
      mode: 'sync',
      placementId: placements.get(rootId) ?? enroll(peer, rootId).id,
      rootId,
      deviceId: row.device_id,
      profileId,
      actor: { profileId },
      send: (message): Promise<void> => {
        sent.push(SYNC_HUB_MESSAGE.parse(message));
        return Promise.resolve();
      },
    }),
  };
  return peer;
}

beforeEach(async () => {
  opened = await driveTestStore(() => NOW);
  directory = await mkdtemp(join(tmpdir(), 'drive-sync-push-'));
  ownerId = opened.store.profiles.first().id;
  samId = opened.store.profiles.create({ name: 'Sam' }).id;
  conflictRows = new Map();
  free = Number.MAX_SAFE_INTEGER;
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
      Promise.resolve({ totalBytes: Number.MAX_SAFE_INTEGER, freeBytes: free }),
    authenticate: (request): ReturnType<SyncEnv['authenticate']> =>
      syncAuthentication(opened.store, new ComputerNodeAccess(opened.store, () => NOW))(request),
  };
  sync = createDriveSync(env);
  await listen();
  owner = peerFor(ownerId);
  laptop = peerFor(ownerId);
  sam = peerFor(samId);
});

afterEach(async () => {
  server.closeAllConnections();
  server.close();
  await opened.close();
  await rm(directory, { recursive: true, force: true });
});

interface RootFields {
  readonly ownerProfileId?: string;
}

async function syncedRoot(fields: RootFields = {}): Promise<StoredDrive> {
  const drive =
    fields.ownerProfileId === undefined
      ? opened.store.driveRoots.insert(sharedDriveRoot(randomUUID()))
      : opened.store.driveRoots.insert(personalDriveRoot(randomUUID(), fields.ownerProfileId));
  await mkdir(drive.path, { recursive: true });
  return drive;
}

function enroll(
  peer: Peer,
  root: Pick<StoredDrive, 'id'> | string,
  settings: { readonly conflictCopies: boolean } = { conflictCopies: true },
): DrivePlacement {
  const rootId = typeof root === 'string' ? root : root.id;
  const placed = opened.store.drivePlacements.insert({
    id: randomUUID(),
    deviceId: peer.row.device_id,
    rootId,
    folderItemId: null,
    mode: 'synced',
    localPath: `/sync/${rootId}`,
    enabled: true,
    createdBy: peer.profileId,
    excluded: [],
    ignorePatterns: [],
    conflictCopies: settings.conflictCopies,
    status: status({ state: 'starting', tier: null, route: null }),
  });
  peer.placements.set(rootId, placed.id);
  return placed;
}

function bytesOf(blocks: number, fill: string): Buffer {
  return Buffer.from(fill.repeat(BLOCK * blocks - 7));
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
      mtime: '2026-01-02T03:04:05.000Z',
      blockSize: BLOCK,
      blocksHash: shaOf(packedToBytes(packed)),
    },
    blocks: packed,
  };
}

function last(peer: Peer): SyncHubMessage {
  const message = peer.sent.at(-1);
  if (message === undefined) throw new Error('nothing was sent');
  return message;
}

function isType<T extends SyncHubMessage['type']>(
  message: SyncHubMessage,
  type: T,
): message is Typed<T> {
  return message.type === type;
}

function lastOf<T extends SyncHubMessage['type']>(peer: Peer, type: T): Typed<T> {
  const message = last(peer);
  if (!isType(message, type)) throw new Error(`expected ${type}, got ${message.type}`);
  return message;
}

async function call(peer: Peer, method: string, path: string, body?: Buffer): Promise<Response> {
  return fetch(`${base}${path}`, {
    method,
    headers: { authorization: `Bearer ${peer.token}` },
    ...(body === undefined ? {} : { body: new Uint8Array(body) }),
  });
}

async function upload(peer: Peer, need: Typed<'need_blocks'>, bytes: Buffer): Promise<void> {
  for (const index of need.indexes) {
    const piece = bytes.subarray(index * BLOCK, (index + 1) * BLOCK);
    const response = await call(
      peer,
      'PUT',
      `/drive/sync/${need.txn}/block/${String(index)}`,
      piece,
    );
    expect(response.status).toBe(204);
  }
}

async function open(peer: Peer, root: StoredDrive, message: Push): Promise<void> {
  await sync.operations.handle(peer.session(root.id), message);
}

async function transfer(
  peer: Peer,
  root: StoredDrive,
  message: Push,
  bytes: Buffer,
): Promise<SyncHubMessage> {
  await open(peer, root, message);
  const first = last(peer);
  if (first.type !== 'need_blocks') return first;
  await upload(peer, first, bytes);
  await sync.operations.handle(peer.session(root.id), {
    type: 'commit',
    opId: message.opId,
    txn: first.txn,
  });
  return last(peer);
}

function item(root: StoredDrive, relPath: string): DriveItem {
  const found = opened.store.driveItems.byPath(root.id, relPath, null);
  if (found === undefined) throw new Error(`${relPath} is not indexed`);
  return found;
}

async function onDisk(root: StoredDrive, relPath: string): Promise<Buffer> {
  return readFile(join(root.path, relPath));
}

async function hubWrite(root: StoredDrive, relPath: string, bytes: Buffer): Promise<DriveItem> {
  const staged = await stageBytes(env, root, Readable.from([bytes]));
  const written = await commitContent(env, { root, staged, relPath, actor: HUB_ACTOR });
  return written.item;
}

async function tmpFiles(root: StoredDrive): Promise<readonly string[]> {
  return readdir(join(root.path, TMP_DIRECTORY));
}

function feedRevs(root: StoredDrive, relPath: string): readonly number[] {
  const id = item(root, relPath).id;
  return opened.store.driveFeed
    .sinceInRoot(root.id, 0, 1000)
    .rows.filter((row) => row.itemId === id)
    .map((row) => row.rev);
}

describe('pushing a file', () => {
  it('asks for every block, takes them over HTTP and commits one new rev with its blocks', async () => {
    const root = await syncedRoot();
    const bytes = bytesOf(3, 'a');
    await open(laptop, root, pushOf('op-1', 'docs/a.txt', null, bytes));
    const need = lastOf(laptop, 'need_blocks');
    expect(need.indexes).toEqual([0, 1, 2]);
    await upload(laptop, need, bytes);
    await sync.operations.handle(laptop.session(root.id), {
      type: 'commit',
      opId: 'op-1',
      txn: need.txn,
    });
    const accepted = lastOf(laptop, 'accept');
    const stored = item(root, 'docs/a.txt');
    expect(accepted).toMatchObject({ opId: 'op-1', rev: stored.rev });
    expect(await onDisk(root, 'docs/a.txt')).toEqual(bytes);
    expect((await stat(join(root.path, 'docs/a.txt'))).mtime.toISOString()).toBe(
      '2026-01-02T03:04:05.000Z',
    );
    expect(item(root, 'docs').kind).toBe('folder');
    expect(opened.store.driveBlocks.find(stored.id, stored.rev)?.hashes.length).toBe(3 * 32);
    expect(feedRevs(root, 'docs/a.txt')).toEqual([stored.rev]);
    expect(accepted.seq).toBe(opened.store.driveFeed.latestSeqInRoot(root.id));
    expect(await tmpFiles(root)).toEqual([]);
  });

  it('commits over the HTTP route and answers the result as JSON', async () => {
    const root = await syncedRoot();
    const bytes = bytesOf(1, 'h');
    await open(laptop, root, pushOf('op-http', 'h.txt', null, bytes));
    const need = lastOf(laptop, 'need_blocks');
    await upload(laptop, need, bytes);
    const response = await call(laptop, 'POST', `/drive/sync/${need.txn}/commit`);
    expect(response.status).toBe(200);
    expect(SYNC_HUB_MESSAGE.parse(await response.json())).toMatchObject({
      type: 'accept',
      opId: 'op-http',
    });
    expect(await onDisk(root, 'h.txt')).toEqual(bytes);
  });

  it('asks only for the blocks the hub does not hold when a file changes in one block', async () => {
    const root = await syncedRoot();
    const first = bytesOf(3, 'a');
    await transfer(laptop, root, pushOf('op-1', 'big.bin', null, first), first);
    const stored = item(root, 'big.bin');
    const edited = Buffer.from(first);
    edited.fill('z', BLOCK, BLOCK + 10);
    await open(laptop, root, pushOf('op-2', 'big.bin', stored.rev, edited));
    const need = lastOf(laptop, 'need_blocks');
    expect(need.indexes).toEqual([1]);
    await upload(laptop, need, edited);
    await sync.operations.handle(laptop.session(root.id), {
      type: 'commit',
      opId: 'op-2',
      txn: need.txn,
    });
    expect(lastOf(laptop, 'accept').rev).toBe(stored.rev + 1);
    expect(await onDisk(root, 'big.bin')).toEqual(edited);
  });

  it('captures the replaced bytes as a version', async () => {
    const root = await syncedRoot();
    const first = bytesOf(1, 'a');
    const second = bytesOf(1, 'b');
    await transfer(laptop, root, pushOf('op-1', 'v.txt', null, first), first);
    const stored = item(root, 'v.txt');
    await transfer(laptop, root, pushOf('op-2', 'v.txt', stored.rev, second), second);
    const version = opened.store.driveVersions.findRev(stored.id, stored.rev);
    expect(version?.version.sha256).toBe(shaOf(first));
  });

  it('accepts a push of the same content as the hub holds without opening a transaction', async () => {
    const root = await syncedRoot();
    const bytes = bytesOf(1, 'a');
    await transfer(laptop, root, pushOf('op-1', 'same.txt', null, bytes), bytes);
    const stored = item(root, 'same.txt');
    await open(owner, root, pushOf('op-2', 'same.txt', null, bytes));
    expect(lastOf(owner, 'accept').rev).toBe(stored.rev);
    expect(item(root, 'same.txt').rev).toBe(stored.rev);
  });

  it('turns a push of nothing into an empty file', async () => {
    const root = await syncedRoot();
    const empty = Buffer.alloc(0);
    const reply = await transfer(laptop, root, pushOf('op-0', 'empty.txt', null, empty), empty);
    expect(reply.type).toBe('accept');
    expect(await onDisk(root, 'empty.txt')).toEqual(empty);
  });
});

describe('what a push may not do', () => {
  it('refuses paths that escape, are absolute or are not NFC', async () => {
    const root = await syncedRoot();
    const bytes = bytesOf(1, 'a');
    for (const [at, path] of ['../out.txt', '/abs.txt', 'a//b.txt', 'café.txt'].entries()) {
      await open(laptop, root, pushOf(`op-${String(at)}`, path, null, bytes));
      expect(lastOf(laptop, 'conflict')).toMatchObject({ reason: 'path', conflictPath: null });
    }
    expect(opened.store.driveItems.byPath(root.id, 'out.txt', null)).toBeUndefined();
  });

  it('refuses Windows reserved names and case collisions only where a Windows computer syncs', async () => {
    const root = await syncedRoot();
    const bytes = bytesOf(1, 'a');
    await transfer(laptop, root, pushOf('op-1', 'photo.jpg', null, bytes), bytes);
    await open(laptop, root, pushOf('op-2', 'Photo.JPG', null, bytes));
    expect(lastOf(laptop, 'need_blocks').indexes).toEqual([0]);
    await open(laptop, root, pushOf('op-3', 'CON.txt', null, bytes));
    expect(lastOf(laptop, 'need_blocks').indexes).toEqual([0]);
    enroll(peerFor(ownerId, 'Windows 11'), root);
    await open(laptop, root, pushOf('op-4', 'Photo.JPG', null, bytes));
    expect(lastOf(laptop, 'conflict').reason).toBe('path');
    await open(laptop, root, pushOf('op-5', 'CON.txt', null, bytes));
    expect(lastOf(laptop, 'conflict').reason).toBe('path');
    await open(laptop, root, pushOf('op-6', 'dir/trailing.', null, bytes));
    expect(lastOf(laptop, 'conflict').reason).toBe('path');
    await open(laptop, root, pushOf('op-7', 'Dir/ok.txt', null, bytes));
    expect(lastOf(laptop, 'need_blocks').indexes).toEqual([0]);
  });

  it('refuses a file where a folder is and a folder where a file is', async () => {
    const root = await syncedRoot();
    const bytes = bytesOf(1, 'a');
    await transfer(laptop, root, pushOf('op-1', 'dir/a.txt', null, bytes), bytes);
    await open(laptop, root, pushOf('op-2', 'dir', null, bytes));
    expect(lastOf(laptop, 'conflict').reason).toBe('exists');
    await open(laptop, root, pushOf('op-3', 'dir/a.txt/deeper.txt', null, bytes));
    expect(lastOf(laptop, 'conflict').reason).toBe('exists');
  });

  it('refuses a push into a receive only folder and into a folder outside the placement', async () => {
    const root = await syncedRoot({ ownerProfileId: samId });
    putItem(opened.store, { rootId: root.id, id: randomUUID(), relPath: 'shared', kind: 'folder' });
    const folder = item(root, 'shared');
    opened.store.driveGrants.set({ itemId: folder.id, profileId: ownerId, role: 'view' }, samId);
    const placed = opened.store.drivePlacements.insert({
      id: randomUUID(),
      deviceId: laptop.row.device_id,
      rootId: root.id,
      folderItemId: folder.id,
      mode: 'synced',
      localPath: '/sync/shared',
      enabled: true,
      createdBy: ownerId,
      excluded: [],
      ignorePatterns: [],
      conflictCopies: true,
      status: status({ state: 'starting', tier: null, route: null, readOnly: true }),
    });
    laptop.placements.set(root.id, placed.id);
    await expect(
      sync.operations.handle(
        laptop.session(root.id),
        pushOf('op-1', 'a.txt', null, bytesOf(1, 'a')),
      ),
    ).rejects.toMatchObject({ code: 'forbidden' });
    opened.store.driveGrants.set({ itemId: folder.id, profileId: ownerId, role: 'edit' }, samId);
    await open(laptop, root, pushOf('op-2', 'new.txt', null, bytesOf(1, 'n')));
    expect(lastOf(laptop, 'need_blocks').indexes).toEqual([0]);
  });

  it('refuses a block list that does not match its checksum', async () => {
    const root = await syncedRoot();
    const message = pushOf('op-1', 'a.txt', null, bytesOf(1, 'a'));
    await expect(
      sync.operations.handle(laptop.session(root.id), {
        ...message,
        meta: { ...message.meta, blocksHash: shaOf('else') },
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
  });
});

describe('blocks over HTTP', () => {
  it('refuses a block that does not match its checksum, one that is not wanted and a short one', async () => {
    const root = await syncedRoot();
    const bytes = bytesOf(2, 'a');
    await open(laptop, root, pushOf('op-1', 'a.bin', null, bytes));
    const need = lastOf(laptop, 'need_blocks');
    const wrong = await call(
      laptop,
      'PUT',
      `/drive/sync/${need.txn}/block/0`,
      Buffer.alloc(BLOCK, 1),
    );
    expect(wrong.status).toBe(400);
    const short = await call(laptop, 'PUT', `/drive/sync/${need.txn}/block/0`, Buffer.alloc(5));
    expect(short.status).toBe(400);
    const unknown = await call(laptop, 'PUT', `/drive/sync/${need.txn}/block/9`, Buffer.alloc(5));
    expect(unknown.status).toBeGreaterThanOrEqual(400);
    await upload(laptop, need, bytes);
    const again = await call(
      laptop,
      'PUT',
      `/drive/sync/${need.txn}/block/0`,
      bytes.subarray(0, BLOCK),
    );
    expect(again.status).toBe(204);
  });

  it('commits again with the missing indexes named when a block never arrived', async () => {
    const root = await syncedRoot();
    const bytes = bytesOf(3, 'a');
    await open(laptop, root, pushOf('op-1', 'm.bin', null, bytes));
    const need = lastOf(laptop, 'need_blocks');
    await upload(laptop, { ...need, indexes: [0, 2] }, bytes);
    await sync.operations.handle(laptop.session(root.id), {
      type: 'commit',
      opId: 'op-1',
      txn: need.txn,
    });
    expect(lastOf(laptop, 'need_blocks').indexes).toEqual([1]);
    expect(opened.store.driveItems.byPath(root.id, 'm.bin', null)).toBeUndefined();
    await upload(laptop, { ...need, indexes: [1] }, bytes);
    await sync.operations.handle(laptop.session(root.id), {
      type: 'commit',
      opId: 'op-1',
      txn: need.txn,
    });
    expect(lastOf(laptop, 'accept').opId).toBe('op-1');
    expect(await onDisk(root, 'm.bin')).toEqual(bytes);
  });

  it('serves a block of a file and refuses another person root', async () => {
    const mine = await syncedRoot({ ownerProfileId: samId });
    const theirs = await syncedRoot({ ownerProfileId: ownerId });
    const bytes = bytesOf(2, 'q');
    await hubWrite(mine, 'mine.bin', bytes);
    await hubWrite(theirs, 'theirs.bin', bytes);
    const own = item(mine, 'mine.bin');
    const hers = item(theirs, 'theirs.bin');
    const served = await call(sam, 'GET', `/drive/blocks/${mine.id}/${own.id}/1`);
    expect(served.status).toBe(200);
    expect(Buffer.from(await served.arrayBuffer())).toEqual(bytes.subarray(BLOCK));
    const refused = await call(sam, 'GET', `/drive/blocks/${theirs.id}/${hers.id}/0`);
    expect(refused.status).toBe(404);
    const crossed = await call(sam, 'GET', `/drive/blocks/${mine.id}/${hers.id}/0`);
    expect(crossed.status).toBe(404);
    const past = await call(sam, 'GET', `/drive/blocks/${mine.id}/${own.id}/2`);
    expect(past.status).toBe(404);
    const anonymous = await fetch(`${base}/drive/blocks/${mine.id}/${own.id}/0`);
    expect(anonymous.status).toBe(401);
  });
});

describe('who may finish a transaction', () => {
  it('refuses a block and a commit from another device and a commit by a stranger over HTTP', async () => {
    const root = await syncedRoot();
    const bytes = bytesOf(1, 'a');
    await open(laptop, root, pushOf('op-1', 'own.txt', null, bytes));
    const need = lastOf(laptop, 'need_blocks');
    const put = await call(owner, 'PUT', `/drive/sync/${need.txn}/block/0`, bytes);
    expect(put.status).toBe(404);
    const post = await call(owner, 'POST', `/drive/sync/${need.txn}/commit`);
    expect(post.status).toBe(404);
    const stranger = await call(sam, 'POST', `/drive/sync/${need.txn}/commit`);
    expect(stranger.status).toBe(404);
    await expect(
      sync.operations.handle(owner.session(root.id), {
        type: 'commit',
        opId: 'op-1',
        txn: need.txn,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await upload(laptop, need, bytes);
    await sync.operations.handle(laptop.session(root.id), {
      type: 'commit',
      opId: 'op-1',
      txn: need.txn,
    });
    expect(lastOf(laptop, 'accept').opId).toBe('op-1');
  });

  it('drops the staging file and the transaction when a computer goes away', async () => {
    const root = await syncedRoot();
    await open(laptop, root, pushOf('op-1', 'gone.txt', null, bytesOf(1, 'a')));
    const need = lastOf(laptop, 'need_blocks');
    expect(await tmpFiles(root)).toHaveLength(1);
    await sync.operations.release(laptop.row.device_id);
    expect(await tmpFiles(root)).toEqual([]);
    const put = await call(laptop, 'PUT', `/drive/sync/${need.txn}/block/0`, bytesOf(1, 'a'));
    expect(put.status).toBe(404);
  });

  it('replaces an earlier transaction for the same path of the same computer', async () => {
    const root = await syncedRoot();
    await open(laptop, root, pushOf('op-1', 'dup.txt', null, bytesOf(1, 'a')));
    const early = lastOf(laptop, 'need_blocks');
    await open(laptop, root, pushOf('op-2', 'dup.txt', null, bytesOf(1, 'b')));
    expect(
      (await call(laptop, 'PUT', `/drive/sync/${early.txn}/block/0`, bytesOf(1, 'a'))).status,
    ).toBe(404);
    expect(await tmpFiles(root)).toHaveLength(1);
  });
});

describe('conflicts', () => {
  it('keeps the hub file and lands a stale push as a conflict copy with its blocks', async () => {
    const root = await syncedRoot();
    const first = bytesOf(1, 'a');
    await transfer(laptop, root, pushOf('op-1', 'c.txt', null, first), first);
    const base1 = item(root, 'c.txt');
    const hub = bytesOf(1, 'b');
    await transfer(owner, root, pushOf('op-2', 'c.txt', base1.rev, hub), hub);
    const stale = bytesOf(1, 'c');
    const reply = await transfer(laptop, root, pushOf('op-3', 'c.txt', base1.rev, stale), stale);
    if (reply.type !== 'conflict') throw new Error('expected a conflict');
    expect(reply).toMatchObject({ reason: 'stale', hubRev: base1.rev + 1 });
    expect(reply.conflictPath).toMatch(/^c\.sync-conflict-\d{8}-\d{6}-[0-9a-f]{8}\.txt$/u);
    expect(await onDisk(root, 'c.txt')).toEqual(hub);
    expect(await onDisk(root, reply.conflictPath ?? '')).toEqual(stale);
    const copy = item(root, reply.conflictPath ?? '');
    expect(opened.store.driveBlocks.find(copy.id, copy.rev)).toBeDefined();
    expect([...conflictRows.values()]).toMatchObject([
      { relPath: 'c.txt', conflictRelPath: reply.conflictPath, deviceId: laptop.row.device_id },
    ]);
    expect(item(root, 'c.txt').rev).toBe(base1.rev + 1);
  });

  it('answers a stale push without a copy when the folder keeps no conflict copies', async () => {
    const root = await syncedRoot();
    enroll(laptop, root, { conflictCopies: false });
    const first = bytesOf(1, 'a');
    await transfer(laptop, root, pushOf('op-1', 'n.txt', null, first), first);
    const stale = bytesOf(1, 'z');
    await open(laptop, root, pushOf('op-2', 'n.txt', null, stale));
    expect(lastOf(laptop, 'conflict')).toMatchObject({ reason: 'stale', conflictPath: null });
    expect(await tmpFiles(root)).toEqual([]);
  });

  it('turns a push that raced a hub write into a conflict copy at commit', async () => {
    const root = await syncedRoot();
    const first = bytesOf(1, 'a');
    await transfer(laptop, root, pushOf('op-1', 'race.txt', null, first), first);
    const stored = item(root, 'race.txt');
    const mine = bytesOf(1, 'm');
    await open(laptop, root, pushOf('op-2', 'race.txt', stored.rev, mine));
    const need = lastOf(laptop, 'need_blocks');
    await hubWrite(root, 'race.txt', bytesOf(1, 'h'));
    await upload(laptop, need, mine);
    await sync.operations.handle(laptop.session(root.id), {
      type: 'commit',
      opId: 'op-2',
      txn: need.txn,
    });
    expect(lastOf(laptop, 'conflict').reason).toBe('stale');
    expect(await onDisk(root, 'race.txt')).toEqual(bytesOf(1, 'h'));
  });

  it('lets an edit beat a delete', async () => {
    const root = await syncedRoot();
    const first = bytesOf(1, 'a');
    await transfer(laptop, root, pushOf('op-1', 'd.txt', null, first), first);
    const stored = item(root, 'd.txt');
    await commitTrash(env, root, stored.id, HUB_ACTOR);
    const edited = bytesOf(1, 'e');
    const reply = await transfer(laptop, root, pushOf('op-2', 'd.txt', stored.rev, edited), edited);
    expect(reply.type).toBe('accept');
    expect(await onDisk(root, 'd.txt')).toEqual(edited);
  });

  it('does not call a push stale after the hub itself committed the file', async () => {
    const root = await syncedRoot();
    const written = await hubWrite(root, 'hub.txt', bytesOf(1, 'a'));
    const next = bytesOf(1, 'n');
    const reply = await transfer(laptop, root, pushOf('op-1', 'hub.txt', written.rev, next), next);
    expect(reply.type).toBe('accept');
    expect(await onDisk(root, 'hub.txt')).toEqual(next);
    expect(item(root, 'hub.txt').rev).toBe(written.rev + 1);
  });

  it('commits a new file with no base as a conflict when the hub has a different one', async () => {
    const root = await syncedRoot();
    await hubWrite(root, 'new.txt', bytesOf(1, 'h'));
    const mine = bytesOf(1, 'm');
    const reply = await transfer(laptop, root, pushOf('op-1', 'new.txt', null, mine), mine);
    expect(reply.type).toBe('conflict');
  });
});

describe('the per-root push queue', () => {
  it('settles two computers committing the same new file one after the other', async () => {
    const root = await syncedRoot();
    const one = bytesOf(1, 'o');
    const two = bytesOf(1, 't');
    await open(laptop, root, pushOf('op-1', 'x.txt', null, one));
    await open(owner, root, pushOf('op-2', 'x.txt', null, two));
    const [needOne, needTwo] = [lastOf(laptop, 'need_blocks'), lastOf(owner, 'need_blocks')];
    await upload(laptop, needOne, one);
    await upload(owner, needTwo, two);
    await Promise.all([
      sync.operations.handle(laptop.session(root.id), {
        type: 'commit',
        opId: 'op-1',
        txn: needOne.txn,
      }),
      sync.operations.handle(owner.session(root.id), {
        type: 'commit',
        opId: 'op-2',
        txn: needTwo.txn,
      }),
    ]);
    const replies = [last(laptop).type, last(owner).type].sort();
    expect(replies).toEqual(['accept', 'conflict']);
    expect(item(root, 'x.txt').rev).toBe(1);
    const names = (await readdir(root.path)).filter((name) => name.startsWith('x'));
    expect(names).toHaveLength(2);
  });
});

describe('operation ids', () => {
  it('answers a repeated push and a repeated commit with the remembered result and applies nothing twice', async () => {
    const root = await syncedRoot();
    const bytes = bytesOf(1, 'a');
    const message = pushOf('op-1', 'once.txt', null, bytes);
    await open(laptop, root, message);
    const need = lastOf(laptop, 'need_blocks');
    await upload(laptop, need, bytes);
    const commit = { type: 'commit', opId: 'op-1', txn: need.txn } as const;
    await sync.operations.handle(laptop.session(root.id), commit);
    const accepted = lastOf(laptop, 'accept');
    await sync.operations.handle(laptop.session(root.id), commit);
    expect(last(laptop)).toEqual(accepted);
    await open(laptop, root, message);
    expect(last(laptop)).toEqual(accepted);
    expect(item(root, 'once.txt').rev).toBe(accepted.rev);
    expect(feedRevs(root, 'once.txt')).toEqual([accepted.rev]);
    expect(await tmpFiles(root)).toEqual([]);
  });

  it('remembers a conflict so a retry gets the same conflict path', async () => {
    const root = await syncedRoot();
    const first = bytesOf(1, 'a');
    await transfer(laptop, root, pushOf('op-1', 'r.txt', null, first), first);
    const stale = bytesOf(1, 's');
    const message = pushOf('op-2', 'r.txt', null, stale);
    const reply = await transfer(laptop, root, message, stale);
    await open(laptop, root, message);
    expect(last(laptop)).toEqual(reply);
    expect(conflictRows.size).toBe(1);
  });
});

describe('quota and space', () => {
  it('refuses a commit over the quota of the person, drops the staging file and leaves the library alone', async () => {
    const root = await syncedRoot();
    opened.store.driveQuotas.set(samId, 10);
    const bytes = bytesOf(1, 'a');
    await open(sam, root, pushOf('op-1', 'big.txt', null, bytes));
    const need = lastOf(sam, 'need_blocks');
    await upload(sam, need, bytes);
    await expect(
      sync.operations.handle(sam.session(root.id), { type: 'commit', opId: 'op-1', txn: need.txn }),
    ).rejects.toMatchObject({ code: 'payload_too_large' });
    expect(opened.store.driveItems.byPath(root.id, 'big.txt', null)).toBeUndefined();
    expect(await tmpFiles(root)).toEqual([]);
  });

  it('refuses a conflict copy that would pass the quota', async () => {
    const root = await syncedRoot();
    const hub = bytesOf(1, 'h');
    await hubWrite(root, 'q.txt', hub);
    opened.store.driveQuotas.set(samId, 10);
    const stale = bytesOf(1, 's');
    await open(sam, root, pushOf('op-1', 'q.txt', null, stale));
    const need = lastOf(sam, 'need_blocks');
    await upload(sam, need, stale);
    await expect(
      sync.operations.handle(sam.session(root.id), { type: 'commit', opId: 'op-1', txn: need.txn }),
    ).rejects.toMatchObject({ code: 'payload_too_large' });
    expect(conflictRows.size).toBe(0);
  });

  it('refuses a commit when the disk has no room', async () => {
    const root = await syncedRoot();
    const bytes = bytesOf(1, 'a');
    await open(laptop, root, pushOf('op-1', 'full.txt', null, bytes));
    const need = lastOf(laptop, 'need_blocks');
    await upload(laptop, need, bytes);
    free = 5;
    await expect(
      sync.operations.handle(laptop.session(root.id), {
        type: 'commit',
        opId: 'op-1',
        txn: need.txn,
      }),
    ).rejects.toMatchObject({ code: 'payload_too_large' });
    expect(await tmpFiles(root)).toEqual([]);
  });
});

describe('moves and deletes', () => {
  it('moves a file and its blocks follow so the index still lists it', async () => {
    const root = await syncedRoot();
    const bytes = bytesOf(2, 'm');
    await transfer(laptop, root, pushOf('op-1', 'a/old.txt', null, bytes), bytes);
    const stored = item(root, 'a/old.txt');
    await sync.operations.handle(laptop.session(root.id), {
      type: 'move',
      opId: 'op-2',
      from: 'a/old.txt',
      to: 'b/c/new.txt',
      baseRev: stored.rev,
    });
    const reply = lastOf(laptop, 'accept');
    const moved = item(root, 'b/c/new.txt');
    expect(moved.id).toBe(stored.id);
    expect(reply.rev).toBe(moved.rev);
    expect(opened.store.driveItems.byPath(root.id, 'a/old.txt', null)).toBeUndefined();
    expect(opened.store.driveBlocks.find(moved.id, moved.rev)?.hashes.length).toBe(2 * 32);
    expect(await onDisk(root, 'b/c/new.txt')).toEqual(bytes);
  });

  it('moves a folder with the blocks of every file in it', async () => {
    const root = await syncedRoot();
    const bytes = bytesOf(1, 'f');
    await transfer(laptop, root, pushOf('op-1', 'dir/in.txt', null, bytes), bytes);
    const folder = item(root, 'dir');
    await sync.operations.handle(laptop.session(root.id), {
      type: 'move',
      opId: 'op-2',
      from: 'dir',
      to: 'renamed',
      baseRev: folder.rev,
    });
    expect(lastOf(laptop, 'accept').opId).toBe('op-2');
    const inside = item(root, 'renamed/in.txt');
    expect(opened.store.driveBlocks.find(inside.id, inside.rev)).toBeDefined();
  });

  it('refuses a move from a stale rev, from nothing, onto a file or into itself', async () => {
    const root = await syncedRoot();
    const bytes = bytesOf(1, 'a');
    await transfer(laptop, root, pushOf('op-1', 'a.txt', null, bytes), bytes);
    await transfer(laptop, root, pushOf('op-2', 'b.txt', null, bytes), bytes);
    await transfer(laptop, root, pushOf('op-3', 'dir/x.txt', null, bytes), bytes);
    const stored = item(root, 'a.txt');
    const move = (opId: string, from: string, to: string, baseRev: number): Promise<void> =>
      sync.operations.handle(laptop.session(root.id), { type: 'move', opId, from, to, baseRev });
    await move('m1', 'a.txt', 'c.txt', stored.rev + 5);
    expect(lastOf(laptop, 'conflict').reason).toBe('stale');
    await move('m2', 'ghost.txt', 'c.txt', 1);
    expect(lastOf(laptop, 'conflict').reason).toBe('missing');
    await move('m3', 'a.txt', 'b.txt', stored.rev);
    expect(lastOf(laptop, 'conflict').reason).toBe('exists');
    await move('m4', 'dir', 'dir/inner', item(root, 'dir').rev);
    expect(lastOf(laptop, 'conflict').reason).toBe('path');
    await writeFile(join(root.path, 'loose.txt'), 'outside');
    await move('m5', 'a.txt', 'loose.txt', stored.rev);
    expect(lastOf(laptop, 'conflict').reason).toBe('exists');
    expect(await onDisk(root, 'a.txt')).toEqual(bytes);
  });

  it('trashes on a matching tombstone and refuses a stale one so an edit beats a delete', async () => {
    const root = await syncedRoot();
    const bytes = bytesOf(1, 'a');
    await transfer(laptop, root, pushOf('op-1', 't.txt', null, bytes), bytes);
    const stored = item(root, 't.txt');
    const handle = (opId: string, baseRev: number): Promise<void> =>
      sync.operations.handle(laptop.session(root.id), {
        type: 'tombstone',
        opId,
        relPath: 't.txt',
        baseRev,
      });
    await handle('t1', stored.rev + 3);
    expect(lastOf(laptop, 'conflict')).toMatchObject({ reason: 'stale', hubRev: stored.rev });
    expect(item(root, 't.txt').id).toBe(stored.id);
    await handle('t2', stored.rev);
    expect(lastOf(laptop, 'accept').rev).toBe(stored.rev + 1);
    expect(opened.store.driveItems.byPath(root.id, 't.txt', null)).toBeUndefined();
    expect(opened.store.driveTrash.find(stored.id)).toBeDefined();
    await handle('t3', stored.rev);
    expect(lastOf(laptop, 'accept').opId).toBe('t3');
  });

  it('refuses to delete a folder that still holds files', async () => {
    const root = await syncedRoot();
    const bytes = bytesOf(1, 'a');
    await transfer(laptop, root, pushOf('op-1', 'dir/a.txt', null, bytes), bytes);
    const folder = item(root, 'dir');
    await sync.operations.handle(laptop.session(root.id), {
      type: 'tombstone',
      opId: 't1',
      relPath: 'dir',
      baseRev: folder.rev,
    });
    expect(lastOf(laptop, 'conflict').reason).toBe('stale');
    expect(item(root, 'dir/a.txt').kind).not.toBe('folder');
  });
});

describe('a folder placed on a computer', () => {
  async function placedFolder(
    excluded: readonly string[],
  ): Promise<{ readonly root: StoredDrive; readonly folder: DriveItem }> {
    const root = await syncedRoot({ ownerProfileId: ownerId });
    await mkdir(join(root.path, 'docs'));
    putItem(opened.store, { rootId: root.id, id: randomUUID(), relPath: 'docs', kind: 'folder' });
    const folder = item(root, 'docs');
    const placed = opened.store.drivePlacements.insert({
      id: randomUUID(),
      deviceId: laptop.row.device_id,
      rootId: root.id,
      folderItemId: folder.id,
      mode: 'synced',
      localPath: '/sync/docs',
      enabled: true,
      createdBy: ownerId,
      excluded,
      ignorePatterns: [],
      conflictCopies: true,
      status: status({ state: 'starting', tier: null, route: null }),
    });
    laptop.placements.set(root.id, placed.id);
    return { root, folder };
  }

  it('lands a push under the folder and answers with the relative path', async () => {
    const { root } = await placedFolder([]);
    const bytes = bytesOf(1, 'a');
    const reply = await transfer(laptop, root, pushOf('op-1', 'sub/a.txt', null, bytes), bytes);
    expect(reply.type).toBe('accept');
    expect(await onDisk(root, 'docs/sub/a.txt')).toEqual(bytes);
    expect(opened.store.driveItems.byPath(root.id, 'sub/a.txt', null)).toBeUndefined();
    expect(item(root, 'docs/sub').kind).toBe('folder');
  });

  it('refuses a push into an excluded folder and one that is the excluded folder', async () => {
    const { root } = await placedFolder(['cache']);
    const bytes = bytesOf(1, 'a');
    await open(laptop, root, pushOf('op-1', 'cache/a.txt', null, bytes));
    expect(lastOf(laptop, 'conflict').reason).toBe('path');
    await open(laptop, root, pushOf('op-2', 'cache', null, bytes));
    expect(lastOf(laptop, 'conflict').reason).toBe('path');
    await open(laptop, root, pushOf('op-3', 'caches/a.txt', null, bytes));
    expect(lastOf(laptop, 'need_blocks').indexes).toEqual([0]);
  });

  it('names a conflict copy relative to the placed folder', async () => {
    const { root } = await placedFolder([]);
    const first = bytesOf(1, 'a');
    await transfer(laptop, root, pushOf('op-1', 'c.txt', null, first), first);
    const base1 = item(root, 'docs/c.txt');
    const hub = bytesOf(1, 'b');
    await hubWrite(root, 'docs/c.txt', hub);
    const stale = bytesOf(1, 'c');
    const reply = await transfer(laptop, root, pushOf('op-2', 'c.txt', base1.rev, stale), stale);
    if (reply.type !== 'conflict') throw new Error('expected a conflict');
    expect(reply.conflictPath).toMatch(/^c\.sync-conflict-\d{8}-\d{6}-[0-9a-f]{8}\.txt$/u);
    expect(await onDisk(root, `docs/${reply.conflictPath ?? ''}`)).toEqual(stale);
  });

  it('moves and deletes inside the folder and refuses both on an excluded path', async () => {
    const { root } = await placedFolder(['cache']);
    const bytes = bytesOf(1, 'a');
    await transfer(laptop, root, pushOf('op-1', 'a.txt', null, bytes), bytes);
    const stored = item(root, 'docs/a.txt');
    const handle = sync.operations.handle.bind(sync.operations);
    await handle(laptop.session(root.id), {
      type: 'move',
      opId: 'm1',
      from: 'a.txt',
      to: 'cache/a.txt',
      baseRev: stored.rev,
    });
    expect(lastOf(laptop, 'conflict').reason).toBe('path');
    await handle(laptop.session(root.id), {
      type: 'tombstone',
      opId: 't1',
      relPath: 'cache/a.txt',
      baseRev: 1,
    });
    expect(lastOf(laptop, 'conflict').reason).toBe('path');
    await handle(laptop.session(root.id), {
      type: 'move',
      opId: 'm2',
      from: 'a.txt',
      to: 'b.txt',
      baseRev: stored.rev,
    });
    expect(lastOf(laptop, 'accept').opId).toBe('m2');
    expect(item(root, 'docs/b.txt').id).toBe(stored.id);
    await handle(laptop.session(root.id), {
      type: 'tombstone',
      opId: 't2',
      relPath: 'b.txt',
      baseRev: item(root, 'docs/b.txt').rev,
    });
    expect(lastOf(laptop, 'accept').opId).toBe('t2');
    expect(opened.store.driveTrash.find(stored.id)).toBeDefined();
  });

  it('refuses a push once the placement is held, switched off or its access ends', async () => {
    const { root, folder } = await placedFolder([]);
    const placementId = laptop.placements.get(root.id) ?? '';
    const message = pushOf('op-1', 'a.txt', null, bytesOf(1, 'a'));
    opened.store.drivePlacements.setHold(placementId, 'trashed');
    await expect(sync.operations.handle(laptop.session(root.id), message)).rejects.toMatchObject({
      code: 'forbidden',
    });
    opened.store.drivePlacements.setHold(placementId, null);
    await open(laptop, root, message);
    expect(lastOf(laptop, 'need_blocks').indexes).toEqual([0]);
    opened.store.driveItems.remove(folder.id);
    await expect(
      sync.operations.handle(laptop.session(root.id), { ...message, opId: 'op-2' }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('refuses a computer that does not own the placement', async () => {
    const { root } = await placedFolder([]);
    const stolen = laptop.placements.get(root.id) ?? '';
    owner.placements.set(root.id, stolen);
    await expect(
      sync.operations.handle(
        owner.session(root.id),
        pushOf('op-1', 'a.txt', null, bytesOf(1, 'a')),
      ),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});
