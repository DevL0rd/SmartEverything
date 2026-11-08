import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import {
  ApiError,
  hashClientToken,
  type ComputerNodeRow,
  type DriveItem,
  type DriveRoot,
} from '@smarteverything/domain';
import { SYNC_HUB_MESSAGE, type SyncHubMessage } from '@smarteverything/domain/drive-sync';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { ComputerNodeAccess } from '../../src/computers/node-access';
import { blocksHashOf, NO_BLOCKS_HASH } from '../../src/drive/sync/server-index';
import {
  DRIVE_SUBSCRIBE_PROTOCOL,
  DRIVE_SYNC_PROTOCOL,
  DriveSyncServer,
  type SyncOperation,
  type SyncSession,
} from '../../src/drive/sync/server-socket';
import type { DriveItemDraft } from '../../src/store/repositories/drive-items';
import { packBlockHashes } from '../../src/store/repositories/drive-blocks';
import { captureLogs, testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';
import { until } from '../support/wait';
import { folderRoot } from './drive-fixture';

const NOW = new Date('2026-11-07T00:00:00.000Z');
const MOMENT = NOW.toISOString();
const BLOCK = 128 * 1024;
const POLICY = 1008;

interface Link {
  readonly socket: WebSocket;
  readonly messages: SyncHubMessage[];
  readonly closed: () => { readonly code: number; readonly reason: string } | null;
}

interface Node {
  readonly token: string;
  readonly row: ComputerNodeRow;
}

let opened: TestStore;
let sync: DriveSyncServer;
let server: Server;
let url = '';
let ownerId = '';
let samId = '';
let handled: { readonly session: SyncSession; readonly message: SyncOperation }[] = [];
let sockets: WebSocket[] = [];
let nodeCount = 0;
let ID = '';
let SAM_ID = '';

beforeEach(async () => {
  captureLogs();
  opened = await testStore(() => NOW);
  ownerId = opened.store.profiles.first().id;
  samId = opened.store.profiles.create({ name: 'Sam' }).id;
  ID = clientOf(ownerId);
  SAM_ID = clientOf(samId);
  handled = [];
  sockets = [];
  sync = new DriveSyncServer(
    opened.store,
    new ComputerNodeAccess(opened.store, () => NOW),
    {
      handle: (session, message): Promise<void> => {
        handled.push({ session, message });
        return Promise.resolve();
      },
    },
    testLogger('drive-sync'),
  );
  server = createServer();
  server.on('upgrade', (request, socket, head) => {
    try {
      sync.upgrade(request, socket, head);
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
  url = `ws://127.0.0.1:${String(address.port)}`;
});

afterEach(async () => {
  for (const socket of sockets) socket.terminate();
  sync.stop();
  server.close();
  await opened.close();
});

function clientOf(profileId: string): string {
  return opened.store.clients.create(
    {
      name: `Desktop ${profileId.slice(0, 4)}`,
      platform: 'desktop',
      role: 'member',
      tokenHash: hashClientToken(`set_${randomBytes(32).toString('hex')}`),
      profileId,
    },
    false,
  ).id;
}

function pairNode(profileId: string | null): Node {
  nodeCount += 1;
  const [device] = opened.store.devices.upsert([
    {
      provider: 'local',
      externalId: `computer:sync:${String(nodeCount)}`,
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
  const row = opened.store.computerNodes.byToken(createHash('sha256').update(token).digest('hex'));
  if (row === undefined) throw new Error('the node was not stored');
  return { token, row };
}

function textOf(data: WebSocket.RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return data.toString('utf8');
}

function connect(node: Node, protocol = DRIVE_SYNC_PROTOCOL): Promise<Link> {
  const socket = new WebSocket(url, [protocol], {
    headers: { authorization: `Bearer ${node.token}` },
  });
  sockets.push(socket);
  const messages: SyncHubMessage[] = [];
  let closed: { code: number; reason: string } | null = null;
  socket.on('message', (data) => {
    messages.push(SYNC_HUB_MESSAGE.parse(JSON.parse(textOf(data))));
  });
  socket.on('close', (code, reason) => {
    closed = { code, reason: reason.toString() };
  });
  return new Promise<Link>((resolve, reject) => {
    socket.once('open', () => {
      resolve({ socket, messages, closed: () => closed });
    });
    socket.once('error', reject);
  });
}

interface HelloOptions {
  readonly afterSeq?: number;
  readonly clientId?: string;
}

function hello(
  link: Link,
  rootId: string,
  indexId: string | null,
  options: HelloOptions = {},
): void {
  link.socket.send(
    JSON.stringify({
      type: 'hello',
      clientId: options.clientId ?? ID,
      rootId,
      indexId,
      afterSeq: options.afterSeq ?? 0,
    }),
  );
}

function syncedRoot(fields: Partial<Extract<DriveRoot, { kind: 'folder' }>> = {}): DriveRoot {
  return opened.store.driveRoots.insert(
    folderRoot(randomUUID(), `/srv/${randomUUID()}`, {
      readOnly: false,
      synced: true,
      indexId: randomUUID(),
      sync: { ignorePatterns: [], conflictCopies: true, clients: [] },
      ...fields,
    }),
  );
}

interface Fields {
  readonly rootId: string;
  readonly parentId: string | null;
  readonly relPath: string;
}

function common(fields: Fields): Omit<DriveItemDraft, 'kind'> {
  return {
    id: randomUUID(),
    ...fields,
    name: fields.relPath.split('/').at(-1) ?? fields.relPath,
    bytes: 0,
    modifiedAt: MOMENT,
    addedAt: MOMENT,
    starred: false,
    outside: false,
    addedByProfileId: null,
    remoteId: null,
    remoteRev: null,
  };
}

function folderDraft(fields: Fields): DriveItemDraft {
  return { ...common(fields), kind: 'folder', childCount: 0 };
}

function fileDraft(fields: Fields): DriveItemDraft {
  return {
    ...common(fields),
    kind: 'document',
    mime: 'text/plain',
    bytes: 10,
    sha256: null,
    integrity: 'unknown',
    thumb: { state: 'none' },
  };
}

function seedFolder(root: DriveRoot, relPath: string): DriveItem {
  const written = opened.store.driveItems.write({
    item: folderDraft({ rootId: root.id, parentId: null, relPath }),
    identity: { dev: '1', ino: String(nodeCount + Math.random()) },
  });
  feed(written.item, 'create');
  return written.item;
}

function seedFile(
  root: DriveRoot,
  relPath: string,
  parent: DriveItem | null,
  hashed: boolean,
): DriveItem {
  const written = opened.store.driveItems.write({
    item: fileDraft({ rootId: root.id, parentId: parent?.id ?? null, relPath }),
    identity: { dev: '1', ino: String(Math.random()) },
  }).item;
  if (hashed) {
    opened.store.driveBlocks.put({
      itemId: written.id,
      rev: written.rev,
      blockSize: BLOCK,
      hashes: packBlockHashes([createHash('sha256').update(relPath).digest()]),
    });
  }
  feed(written, 'create');
  return written;
}

function feed(item: DriveItem, op: 'create' | 'update' | 'trash'): void {
  opened.store.driveFeed.append({
    rootId: item.rootId,
    itemId: item.id,
    op,
    rev: item.rev,
    actorProfileId: null,
    via: 'scan',
    deviceId: null,
  });
}

function announce(root: DriveRoot): void {
  opened.store.write(() => {
    opened.store.feed.notice({
      type: 'drive_changed',
      rootIds: [root.id],
      folderIds: [],
      albumIds: [],
      months: [],
      cursor: opened.store.driveFeed.latestSeq(),
    });
  });
}

function typed<T extends SyncHubMessage['type']>(
  link: Link,
  type: T,
): Extract<SyncHubMessage, { type: T }>[] {
  return link.messages.filter(
    (message): message is Extract<SyncHubMessage, { type: T }> => message.type === type,
  );
}

describe('the sync socket access', () => {
  it('refuses a missing or unknown node token', async () => {
    await expect(
      connect({ token: 'sen_' + 'a'.repeat(43), row: pairNode(ownerId).row }),
    ).rejects.toThrow();
    await expect(connect({ token: 'not a token', row: pairNode(ownerId).row })).rejects.toThrow();
  });

  it('refuses a computer that is paired for nobody', async () => {
    await expect(connect(pairNode(null))).rejects.toThrow();
  });

  it('refuses a revoked computer', async () => {
    const node = pairNode(ownerId);
    opened.store.computerNodes.revoke(node.row.device_id);
    await expect(connect(node)).rejects.toThrow();
  });
});

describe('the index', () => {
  it('sends every hashed entry in pages that end with last, ordered parents first', async () => {
    const root = syncedRoot();
    const folder = seedFolder(root, 'docs');
    const inner = seedFile(root, 'docs/a.txt', folder, true);
    const top = seedFile(root, 'b.txt', null, true);
    seedFile(root, 'unhashed.txt', null, false);
    const link = await connect(pairNode(ownerId));
    hello(link, root.id, null);
    await until(() => typed(link, 'index').some((page) => page.last), 'the last index page');
    const entries = typed(link, 'index').flatMap((page) => page.entries);
    expect(entries.map((entry) => entry.relPath).sort()).toEqual(['b.txt', 'docs', 'docs/a.txt']);
    expect(entries.findIndex((entry) => entry.relPath === 'docs')).toBeLessThan(
      entries.findIndex((entry) => entry.relPath === 'docs/a.txt'),
    );
    const file = entries.find((entry) => entry.itemId === inner.id);
    const stored = opened.store.driveBlocks.find(inner.id, inner.rev);
    expect(file).toMatchObject({
      kind: 'file',
      rev: inner.rev,
      blockSize: BLOCK,
      blocksHash: blocksHashOf(stored?.hashes ?? new Uint8Array()),
    });
    expect(entries.some((entry) => entry.itemId === top.id)).toBe(true);
    const [first] = typed(link, 'index');
    expect(first).toMatchObject({
      indexId: root.indexId,
      seq: opened.store.driveFeed.latestSeqInRoot(root.id),
    });
  });

  it('indexes an empty folder with one empty last page', async () => {
    const root = syncedRoot();
    const link = await connect(pairNode(ownerId));
    hello(link, root.id, null);
    await until(() => typed(link, 'index').length === 1, 'the index');
    expect(typed(link, 'index')[0]).toMatchObject({ entries: [], last: true, seq: 0 });
  });

  it('re-indexes in full when the index id is stale', async () => {
    const root = syncedRoot();
    seedFile(root, 'a.txt', null, true);
    const link = await connect(pairNode(ownerId));
    hello(link, root.id, randomUUID(), { afterSeq: 1 });
    await until(() => typed(link, 'index').some((page) => page.last), 'the full index');
    expect(typed(link, 'index_update')).toEqual([]);
    expect(typed(link, 'index')[0]?.indexId).toBe(root.indexId);
  });

  it('re-indexes in full when the cursor is ahead of the hub', async () => {
    const root = syncedRoot();
    seedFile(root, 'a.txt', null, true);
    const link = await connect(pairNode(ownerId));
    hello(link, root.id, root.indexId, { afterSeq: 999 });
    await until(() => typed(link, 'index').some((page) => page.last), 'the full index');
  });

  it('answers a current cursor with only the changes after it', async () => {
    const root = syncedRoot();
    const old = seedFile(root, 'old.txt', null, true);
    const seen = opened.store.driveFeed.latestSeqInRoot(root.id);
    const fresh = seedFile(root, 'fresh.txt', null, true);
    const link = await connect(pairNode(ownerId));
    hello(link, root.id, root.indexId, { afterSeq: seen });
    await until(() => typed(link, 'index_update').length === 1, 'the catch-up update');
    expect(typed(link, 'index')).toEqual([]);
    const [update] = typed(link, 'index_update');
    expect(update?.entries.map((entry) => entry.itemId)).toEqual([fresh.id]);
    expect(update?.entries.some((entry) => entry.itemId === old.id)).toBe(false);
    expect(update?.seq).toBe(opened.store.driveFeed.latestSeqInRoot(root.id));
  });

  it('sends one empty update when the client is already current', async () => {
    const root = syncedRoot();
    seedFile(root, 'a.txt', null, true);
    const seen = opened.store.driveFeed.latestSeqInRoot(root.id);
    const link = await connect(pairNode(ownerId));
    hello(link, root.id, root.indexId, { afterSeq: seen });
    await until(() => typed(link, 'index_update').length === 1, 'the marker');
    expect(typed(link, 'index_update')[0]).toMatchObject({ entries: [], seq: seen });
  });
});

describe('the live echo', () => {
  it('echoes a commit to every subscribed client of the root and not to another root', async () => {
    const root = syncedRoot();
    const other = syncedRoot();
    const first = await connect(pairNode(ownerId));
    const second = await connect(pairNode(ownerId), DRIVE_SUBSCRIBE_PROTOCOL);
    const away = await connect(pairNode(ownerId));
    hello(first, root.id, null);
    hello(second, root.id, null, { clientId: randomUUID() });
    hello(away, other.id, null);
    await until(
      () => [first, second, away].every((link) => typed(link, 'index').length === 1),
      'the three indexes',
    );
    const added = seedFile(root, 'new.txt', null, true);
    announce(root);
    await until(
      () => typed(first, 'index_update').length === 1 && typed(second, 'index_update').length === 1,
      'the echo',
    );
    for (const link of [first, second]) {
      expect(typed(link, 'index_update')[0]?.entries.map((entry) => entry.itemId)).toEqual([
        added.id,
      ]);
    }
    expect(typed(away, 'index_update')).toEqual([]);
  });

  it('sends a tombstone for a trashed item', async () => {
    const root = syncedRoot();
    const file = seedFile(root, 'gone.txt', null, true);
    const link = await connect(pairNode(ownerId));
    hello(link, root.id, null);
    await until(() => typed(link, 'index').length === 1, 'the index');
    opened.store.driveTrash.insert({
      itemId: file.id,
      rootId: root.id,
      name: 'gone.txt',
      originalRelPath: 'gone.txt',
      trashRelPath: `.smarteverything/trash/${file.id}`,
      isFolder: false,
      bytes: 10,
      deletedAt: MOMENT,
      purgeAt: new Date(NOW.getTime() + 86_400_000).toISOString(),
      deletedBy: null,
      addedByProfileId: null,
    });
    opened.store.driveItems.remove(file.id);
    opened.store.driveFeed.append({
      rootId: root.id,
      itemId: file.id,
      op: 'trash',
      rev: file.rev + 1,
      actorProfileId: null,
      via: 'scan',
      deviceId: null,
    });
    announce(root);
    await until(() => typed(link, 'index_update').length === 1, 'the tombstone');
    expect(typed(link, 'index_update')[0]?.entries[0]).toMatchObject({
      itemId: file.id,
      relPath: 'gone.txt',
      deleted: true,
      rev: file.rev + 1,
      blocksHash: NO_BLOCKS_HASH,
    });
  });
});

describe('member scope', () => {
  it('refuses a member computer on another person root and serves its own', async () => {
    const mine = syncedRoot({ scope: 'person', ownerProfileId: samId });
    const theirs = syncedRoot({ scope: 'person', ownerProfileId: ownerId });
    const home = syncedRoot();
    const node = pairNode(samId);
    const refused = await connect(node);
    hello(refused, theirs.id, null, { clientId: SAM_ID });
    await until(() => refused.closed() !== null, 'the refusal');
    expect(refused.closed()?.code).toBe(POLICY);
    expect(refused.messages).toEqual([]);
    const own = await connect(node);
    hello(own, mine.id, null, { clientId: SAM_ID });
    await until(() => typed(own, 'index').length === 1, 'the own index');
    const shared = await connect(pairNode(samId));
    hello(shared, home.id, null, { clientId: SAM_ID });
    await until(() => typed(shared, 'index').length === 1, 'the home index');
  });

  it('gives the owner computer every root', async () => {
    const theirs = syncedRoot({ scope: 'person', ownerProfileId: samId });
    const link = await connect(pairNode(ownerId));
    hello(link, theirs.id, null);
    await until(() => typed(link, 'index').length === 1, 'the index');
  });
});

describe('sync clients', () => {
  it('registers the client under the node id and the paired person, then stores its state', async () => {
    const root = syncedRoot();
    const node = pairNode(samId);
    const link = await connect(node);
    hello(link, root.id, null, { clientId: SAM_ID });
    await until(() => typed(link, 'index').length === 1, 'the index');
    const client = opened.store.driveSyncClients.byKey(SAM_ID, root.id);
    expect(client).toMatchObject({
      deviceId: node.row.device_id,
      profileId: samId,
      enabled: true,
    });
    expect(opened.store.driveRoots.byId(root.id).sync).toMatchObject({
      clients: [{ clientId: SAM_ID, enabled: true }],
    });
    link.socket.send(
      JSON.stringify({
        type: 'client_state',
        need: 42,
        have: 7,
        errors: [{ relPath: 'a.txt', message: 'locked', at: MOMENT }],
      }),
    );
    await until(
      () => opened.store.driveSyncClients.byKey(SAM_ID, root.id).needBytes === 42,
      'the stored state',
    );
    expect(opened.store.driveSyncClients.byKey(SAM_ID, root.id).errors).toHaveLength(1);
  });

  it('refuses the same client id from another computer', async () => {
    const root = syncedRoot();
    const first = await connect(pairNode(ownerId));
    hello(first, root.id, null);
    await until(() => typed(first, 'index').length === 1, 'the index');
    const intruder = await connect(pairNode(ownerId));
    hello(intruder, root.id, null);
    await until(() => intruder.closed() !== null, 'the refusal');
    expect(intruder.closed()?.code).toBe(POLICY);
  });

  it('refuses a folder that is not synced', async () => {
    const root = syncedRoot({
      synced: false,
      sync: { ignorePatterns: [], conflictCopies: true, clients: [] },
    });
    const link = await connect(pairNode(ownerId));
    hello(link, root.id, null);
    await until(() => link.closed() !== null, 'the refusal');
    expect(link.closed()?.code).toBe(POLICY);
  });
});

describe('frames', () => {
  it('hands pushes to the operations after hello and refuses them before it', async () => {
    const root = syncedRoot();
    const early = await connect(pairNode(ownerId));
    early.socket.send(JSON.stringify({ type: 'tombstone', opId: 'x', relPath: 'a', baseRev: 1 }));
    await until(() => early.closed() !== null, 'the refusal');
    expect(handled).toEqual([]);
    const link = await connect(pairNode(ownerId));
    hello(link, root.id, null);
    await until(() => typed(link, 'index').length === 1, 'the index');
    link.socket.send(
      JSON.stringify({ type: 'tombstone', opId: 'op-1', relPath: 'a.txt', baseRev: 3 }),
    );
    await until(() => handled.length === 1, 'the operation');
    expect(handled[0]?.message).toMatchObject({ type: 'tombstone', opId: 'op-1' });
    expect(handled[0]?.session).toMatchObject({ rootId: root.id, clientId: ID, mode: 'sync' });
  });

  it('refuses writes and client state on the subscribe-only channel', async () => {
    const root = syncedRoot();
    const link = await connect(pairNode(ownerId), DRIVE_SUBSCRIBE_PROTOCOL);
    hello(link, root.id, null);
    await until(() => typed(link, 'index').length === 1, 'the index');
    link.socket.send(JSON.stringify({ type: 'client_state', need: 0, have: 0, errors: [] }));
    await until(() => link.closed() !== null, 'the refusal');
    expect(link.closed()?.code).toBe(POLICY);
    expect(handled).toEqual([]);
    expect(opened.store.driveSyncClients.find(ID, root.id)).toBeUndefined();
  });

  it('refuses an unknown message kind and a second hello', async () => {
    const root = syncedRoot();
    const unknown = await connect(pairNode(ownerId));
    unknown.socket.send(JSON.stringify({ type: 'surprise' }));
    await until(() => unknown.closed() !== null, 'the refusal');
    const twice = await connect(pairNode(ownerId));
    hello(twice, root.id, null);
    await until(() => typed(twice, 'index').length === 1, 'the index');
    hello(twice, root.id, null);
    await until(() => twice.closed() !== null, 'the second refusal');
    expect(twice.closed()?.code).toBe(POLICY);
  });

  it('closes a connection whose client row was switched off when the next change lands', async () => {
    const root = syncedRoot();
    const link = await connect(pairNode(ownerId));
    hello(link, root.id, null);
    await until(() => typed(link, 'index').length === 1, 'the index');
    const row = opened.store.driveSyncClients.byKey(ID, root.id);
    opened.store.driveSyncClients.set(
      { clientId: ID, rootId: root.id, enabled: false, selected: [] },
      { deviceId: row.deviceId, profileId: row.profileId },
    );
    seedFile(root, 'x.txt', null, true);
    announce(root);
    await until(() => link.closed() !== null, 'the close');
    expect(link.closed()?.code).toBe(POLICY);
  });
});
