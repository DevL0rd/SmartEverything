import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import {
  ApiError,
  type ComputerNodeRow,
  type DriveItem,
  type DrivePlacement,
} from '@smarteverything/domain';
import { SYNC_HUB_MESSAGE, type SyncHubMessage } from '@smarteverything/domain/drive-sync';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { ComputerNodeAccess } from '../../src/computers/node-access';
import { resolveScope } from '../../src/drive/sync/placement-scope';
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
import type { StoredDrive } from '../../src/store/repositories/drive-roots';
import { personalDriveRoot, sharedDriveRoot } from '../store/drive-roots-fixture';
import type { TestStore } from '../support/store';
import { until } from '../support/wait';
import { status } from './placement-fixture';
import { driveTestStore } from './spaces-fixture';

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
  readonly profileId: string | null;
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

beforeEach(async () => {
  captureLogs();
  opened = await driveTestStore(() => NOW);
  ownerId = opened.store.profiles.first().id;
  samId = opened.store.profiles.create({ name: 'Sam' }).id;
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
  return { token, row, profileId };
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
}

function hello(
  link: Link,
  placementId: string,
  indexId: string | null,
  options: HelloOptions = {},
): void {
  link.socket.send(
    JSON.stringify({
      type: 'hello',
      placementId,
      indexId,
      afterSeq: options.afterSeq ?? 0,
    }),
  );
}

interface RootFields {
  readonly ownerProfileId?: string;
}

function syncedRoot(fields: RootFields = {}): StoredDrive {
  return fields.ownerProfileId === undefined
    ? opened.store.driveRoots.insert(sharedDriveRoot(randomUUID()))
    : opened.store.driveRoots.insert(personalDriveRoot(randomUUID(), fields.ownerProfileId));
}

interface PlaceFields {
  readonly mode?: 'synced' | 'mounted';
  readonly folderItemId?: string;
  readonly excluded?: readonly string[];
}

function place(
  node: Node,
  root: Pick<StoredDrive, 'id'>,
  fields: PlaceFields = {},
): DrivePlacement {
  const mode = fields.mode ?? 'synced';
  return opened.store.drivePlacements.insert({
    id: randomUUID(),
    deviceId: node.row.device_id,
    rootId: root.id,
    folderItemId: fields.folderItemId ?? null,
    mode,
    localPath: `/sync/${randomUUID()}`,
    enabled: true,
    createdBy: node.profileId ?? ownerId,
    ...(mode === 'synced'
      ? { excluded: fields.excluded ?? [], ignorePatterns: [], conflictCopies: true }
      : {}),
    status: status({ state: 'starting', tier: null, route: null }),
  });
}

function indexIdOf(node: Node, placement: DrivePlacement): string {
  return resolveScope(opened.store, placement.id, node.row.device_id, 'subscribe').indexId;
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
    shared: false,
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

function seedFolder(root: StoredDrive, relPath: string): DriveItem {
  const written = opened.store.driveItems.write({
    item: folderDraft({ rootId: root.id, parentId: null, relPath }),
    identity: { dev: '1', ino: String(nodeCount + Math.random()) },
  });
  feed(written.item, 'create');
  return written.item;
}

function seedFolderUnder(root: StoredDrive, relPath: string, parent: DriveItem): DriveItem {
  const written = opened.store.driveItems.write({
    item: folderDraft({ rootId: root.id, parentId: parent.id, relPath }),
    identity: { dev: '1', ino: String(Math.random()) },
  });
  feed(written.item, 'create');
  return written.item;
}

function seedFile(
  root: StoredDrive,
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

function announce(root: StoredDrive): void {
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
      connect({ token: 'sen_' + 'a'.repeat(43), row: pairNode(ownerId).row, profileId: ownerId }),
    ).rejects.toThrow();
    await expect(
      connect({ token: 'not a token', row: pairNode(ownerId).row, profileId: ownerId }),
    ).rejects.toThrow();
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
    const node = pairNode(ownerId);
    const placement = place(node, root);
    const link = await connect(node);
    hello(link, placement.id, null);
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
      indexId: indexIdOf(node, placement),
      seq: opened.store.driveFeed.latestSeqInRoot(root.id),
    });
  });

  it('indexes an empty folder with one empty last page', async () => {
    const root = syncedRoot();
    const node = pairNode(ownerId);
    const link = await connect(node);
    hello(link, place(node, root).id, null);
    await until(() => typed(link, 'index').length === 1, 'the index');
    expect(typed(link, 'index')[0]).toMatchObject({ entries: [], last: true, seq: 0 });
  });

  it('re-indexes in full when the index id is stale', async () => {
    const root = syncedRoot();
    seedFile(root, 'a.txt', null, true);
    const node = pairNode(ownerId);
    const placement = place(node, root);
    const link = await connect(node);
    hello(link, placement.id, randomUUID(), { afterSeq: 1 });
    await until(() => typed(link, 'index').some((page) => page.last), 'the full index');
    expect(typed(link, 'index_update')).toEqual([]);
    expect(typed(link, 'index')[0]?.indexId).toBe(indexIdOf(node, placement));
  });

  it('re-indexes in full when the cursor is ahead of the hub', async () => {
    const root = syncedRoot();
    seedFile(root, 'a.txt', null, true);
    const node = pairNode(ownerId);
    const placement = place(node, root);
    const link = await connect(node);
    hello(link, placement.id, indexIdOf(node, placement), { afterSeq: 999 });
    await until(() => typed(link, 'index').some((page) => page.last), 'the full index');
  });

  it('answers a current cursor with only the changes after it', async () => {
    const root = syncedRoot();
    const old = seedFile(root, 'old.txt', null, true);
    const seen = opened.store.driveFeed.latestSeqInRoot(root.id);
    const fresh = seedFile(root, 'fresh.txt', null, true);
    const node = pairNode(ownerId);
    const placement = place(node, root);
    const link = await connect(node);
    hello(link, placement.id, indexIdOf(node, placement), { afterSeq: seen });
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
    const node = pairNode(ownerId);
    const placement = place(node, root);
    const link = await connect(node);
    hello(link, placement.id, indexIdOf(node, placement), { afterSeq: seen });
    await until(() => typed(link, 'index_update').length === 1, 'the marker');
    expect(typed(link, 'index_update')[0]).toMatchObject({ entries: [], seq: seen });
  });
});

describe('the index of a placed folder', () => {
  it('sends only the folder with paths relative to it and never an excluded folder', async () => {
    const root = syncedRoot({ ownerProfileId: ownerId });
    const docs = seedFolder(root, 'docs');
    seedFile(root, 'docs/a.txt', docs, true);
    const cache = seedFolderUnder(root, 'docs/cache', docs);
    seedFile(root, 'docs/cache/big.bin', cache, true);
    const sub = seedFolderUnder(root, 'docs/sub', docs);
    seedFile(root, 'docs/sub/b.txt', sub, true);
    seedFile(root, 'outside.txt', null, true);
    const node = pairNode(ownerId);
    const placement = place(node, root, { folderItemId: docs.id, excluded: ['cache'] });
    const link = await connect(node);
    hello(link, placement.id, null);
    await until(() => typed(link, 'index').some((page) => page.last), 'the index');
    const entries = typed(link, 'index').flatMap((page) => page.entries);
    expect(entries.map((entry) => entry.relPath).sort()).toEqual(['a.txt', 'sub', 'sub/b.txt']);
  });

  it('gives a placed folder its own index id and re-indexes when the excluded folders change', async () => {
    const root = syncedRoot({ ownerProfileId: ownerId });
    const docs = seedFolder(root, 'docs');
    const node = pairNode(ownerId);
    const whole = place(node, root);
    const placed = place(node, root, { folderItemId: docs.id });
    expect(indexIdOf(node, placed)).not.toBe(indexIdOf(node, whole));
    const before = indexIdOf(node, placed);
    opened.store.drivePlacements.retarget(placed.id, {
      mode: 'synced',
      localPath: placed.localPath,
      enabled: true,
      readOnly: false,
      excluded: ['cache'],
      ignorePatterns: [],
      conflictCopies: true,
    });
    expect(indexIdOf(node, placed)).not.toBe(before);
    const link = await connect(node);
    hello(link, placed.id, before, { afterSeq: 0 });
    await until(() => typed(link, 'index').some((page) => page.last), 'the full index');
  });

  it('echoes changes inside the folder and a departure as a tombstone, and nothing else', async () => {
    const root = syncedRoot({ ownerProfileId: ownerId });
    const docs = seedFolder(root, 'docs');
    const moving = seedFile(root, 'docs/m.txt', docs, true);
    const node = pairNode(ownerId);
    const placement = place(node, root, { folderItemId: docs.id });
    const link = await connect(node);
    hello(link, placement.id, null);
    await until(() => typed(link, 'index').length === 1, 'the index');
    const inside = seedFile(root, 'docs/in.txt', docs, true);
    seedFile(root, 'elsewhere.txt', null, true);
    announce(root);
    await until(() => typed(link, 'index_update').length === 1, 'the echo');
    expect(typed(link, 'index_update')[0]?.entries.map((entry) => entry.itemId)).toEqual([
      inside.id,
    ]);
    opened.store.driveItems.write({
      item: { ...moving, parentId: null, relPath: 'moved-out.txt' },
      identity: { dev: '1', ino: String(Math.random()) },
    });
    opened.store.driveFeed.append({
      rootId: root.id,
      itemId: moving.id,
      op: 'move',
      rev: moving.rev + 1,
      actorProfileId: null,
      via: 'scan',
      deviceId: null,
    });
    announce(root);
    await until(() => typed(link, 'index_update').length === 2, 'the departure');
    expect(typed(link, 'index_update')[1]?.entries).toMatchObject([
      { itemId: moving.id, deleted: true },
    ]);
  });
});

describe('the live echo', () => {
  it('echoes a commit to every subscribed client of the root and not to another root', async () => {
    const root = syncedRoot();
    const other = syncedRoot({ ownerProfileId: ownerId });
    const firstNode = pairNode(ownerId);
    const secondNode = pairNode(ownerId);
    const awayNode = pairNode(ownerId);
    const first = await connect(firstNode);
    const second = await connect(secondNode, DRIVE_SUBSCRIBE_PROTOCOL);
    const away = await connect(awayNode);
    hello(first, place(firstNode, root).id, null);
    hello(second, place(secondNode, root, { mode: 'mounted' }).id, null);
    hello(away, place(awayNode, other).id, null);
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
    const node = pairNode(ownerId);
    const link = await connect(node);
    hello(link, place(node, root).id, null);
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

describe('who may open what', () => {
  it('refuses a hello for a drive or folder the placement person cannot open', async () => {
    const mine = syncedRoot({ ownerProfileId: samId });
    const theirs = syncedRoot({ ownerProfileId: ownerId });
    const home = syncedRoot();
    const node = pairNode(samId);
    const forbidden = place(node, theirs);
    const refused = await connect(node);
    hello(refused, forbidden.id, null);
    await until(() => refused.closed() !== null, 'the refusal');
    expect(refused.closed()?.code).toBe(POLICY);
    expect(refused.messages).toEqual([]);
    const own = await connect(node);
    hello(own, place(node, mine).id, null);
    await until(() => typed(own, 'index').length === 1, 'the own index');
    const sharedNode = pairNode(samId);
    const sharedLink = await connect(sharedNode);
    hello(sharedLink, place(sharedNode, home).id, null);
    await until(() => typed(sharedLink, 'index').length === 1, 'the home index');
  });

  it('refuses the Hub owner computer on a member drive placed for it', async () => {
    const theirs = syncedRoot({ ownerProfileId: samId });
    const node = pairNode(ownerId);
    const link = await connect(node);
    hello(link, place(node, theirs).id, null);
    await until(() => link.closed() !== null, 'the refusal');
    expect(link.closed()?.code).toBe(POLICY);
    expect(link.messages).toEqual([]);
  });

  it('serves a folder shared with the person and closes when the grant ends', async () => {
    const theirs = syncedRoot({ ownerProfileId: samId });
    const folder = seedFolder(theirs, 'trip');
    seedFile(theirs, 'trip/a.txt', folder, true);
    const grant = opened.store.driveGrants.set(
      { itemId: folder.id, profileId: ownerId, role: 'view' },
      samId,
    );
    const node = pairNode(ownerId);
    const link = await connect(node);
    hello(link, place(node, theirs, { folderItemId: folder.id }).id, null);
    await until(() => typed(link, 'index').length === 1, 'the index');
    expect(typed(link, 'index')[0]?.entries.map((entry) => entry.relPath)).toEqual(['a.txt']);
    opened.store.driveGrants.remove(grant.id);
    seedFile(theirs, 'trip/b.txt', folder, true);
    announce(theirs);
    await until(() => link.closed() !== null, 'the close');
    expect(link.closed()?.code).toBe(POLICY);
  });
});

describe('placement state', () => {
  it('stores the need and errors of the client in the placement status', async () => {
    const root = syncedRoot();
    const node = pairNode(samId);
    const placement = place(node, root);
    const link = await connect(node);
    hello(link, placement.id, null);
    await until(() => typed(link, 'index').length === 1, 'the index');
    link.socket.send(
      JSON.stringify({
        type: 'client_state',
        need: 42,
        have: 7,
        errors: [{ relPath: 'a.txt', message: 'locked', at: MOMENT }],
      }),
    );
    await until(
      () => opened.store.drivePlacements.byId(placement.id).status.needBytes === 42,
      'the stored state',
    );
    const stored = opened.store.drivePlacements.byId(placement.id).status;
    expect(stored.errors).toHaveLength(1);
    expect(stored.lastSyncedAt).toBeNull();
    link.socket.send(JSON.stringify({ type: 'client_state', need: 0, have: 7, errors: [] }));
    await until(
      () => opened.store.drivePlacements.byId(placement.id).status.needBytes === 0,
      'the settled state',
    );
    expect(opened.store.drivePlacements.byId(placement.id).status.lastSyncedAt).toBe(MOMENT);
  });

  it('refuses another computer saying hello for the placement', async () => {
    const root = syncedRoot();
    const first = pairNode(ownerId);
    const placement = place(first, root);
    const intruder = await connect(pairNode(ownerId));
    hello(intruder, placement.id, null);
    await until(() => intruder.closed() !== null, 'the refusal');
    expect(intruder.closed()?.code).toBe(POLICY);
  });

  it('refuses a mounted placement on the sync channel and a held or disabled one', async () => {
    const root = syncedRoot();
    const node = pairNode(ownerId);
    const mounted = place(node, root, { mode: 'mounted' });
    const refused = await connect(node);
    hello(refused, mounted.id, null);
    await until(() => refused.closed() !== null, 'the refusal');
    expect(refused.closed()?.code).toBe(POLICY);
    const held = place(node, root, { folderItemId: seedFolder(root, 'h').id });
    opened.store.drivePlacements.setHold(held.id, 'trashed');
    const heldLink = await connect(node);
    hello(heldLink, held.id, null);
    await until(() => heldLink.closed() !== null, 'the hold refusal');
    expect(heldLink.closed()?.code).toBe(POLICY);
  });

  it('refuses a placement that is missing', async () => {
    const link = await connect(pairNode(ownerId));
    hello(link, randomUUID(), null);
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
    const node = pairNode(ownerId);
    const placement = place(node, root);
    const link = await connect(node);
    hello(link, placement.id, null);
    await until(() => typed(link, 'index').length === 1, 'the index');
    link.socket.send(
      JSON.stringify({ type: 'tombstone', opId: 'op-1', relPath: 'a.txt', baseRev: 3 }),
    );
    await until(() => handled.length === 1, 'the operation');
    expect(handled[0]?.message).toMatchObject({ type: 'tombstone', opId: 'op-1' });
    expect(handled[0]?.session).toMatchObject({
      rootId: root.id,
      placementId: placement.id,
      mode: 'sync',
    });
  });

  it('refuses writes and client state on the subscribe-only channel', async () => {
    const root = syncedRoot();
    const node = pairNode(ownerId);
    const placement = place(node, root, { mode: 'mounted' });
    const link = await connect(node, DRIVE_SUBSCRIBE_PROTOCOL);
    hello(link, placement.id, null);
    await until(() => typed(link, 'index').length === 1, 'the index');
    link.socket.send(JSON.stringify({ type: 'client_state', need: 0, have: 0, errors: [] }));
    await until(() => link.closed() !== null, 'the refusal');
    expect(link.closed()?.code).toBe(POLICY);
    expect(handled).toEqual([]);
  });

  it('refuses an unknown message kind and a second hello', async () => {
    const root = syncedRoot();
    const unknown = await connect(pairNode(ownerId));
    unknown.socket.send(JSON.stringify({ type: 'surprise' }));
    await until(() => unknown.closed() !== null, 'the refusal');
    const node = pairNode(ownerId);
    const placement = place(node, root);
    const twice = await connect(node);
    hello(twice, placement.id, null);
    await until(() => typed(twice, 'index').length === 1, 'the index');
    hello(twice, placement.id, null);
    await until(() => twice.closed() !== null, 'the second refusal');
    expect(twice.closed()?.code).toBe(POLICY);
  });

  it('closes a connection whose placement was switched off or removed on the next change', async () => {
    const root = syncedRoot();
    const node = pairNode(ownerId);
    const placement = place(node, root);
    const link = await connect(node);
    hello(link, placement.id, null);
    await until(() => typed(link, 'index').length === 1, 'the index');
    opened.store.drivePlacements.setHold(placement.id, 'no_access');
    await until(() => link.closed() !== null, 'the close');
    expect(link.closed()?.code).toBe(POLICY);
  });

  it('closes a connection whose placement was removed', async () => {
    const root = syncedRoot();
    const node = pairNode(ownerId);
    const placement = place(node, root);
    const link = await connect(node);
    hello(link, placement.id, null);
    await until(() => typed(link, 'index').length === 1, 'the index');
    opened.store.drivePlacements.remove(placement.id);
    await until(() => link.closed() !== null, 'the close');
    expect(link.closed()?.code).toBe(POLICY);
  });
});
