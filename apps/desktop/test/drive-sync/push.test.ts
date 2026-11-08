import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { blockSizeFor } from '@smarteverything/domain/drive-sync';
import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HubBlockUploader } from '../../src/drive-sync/block-upload.js';
import { openDriveSyncDatabase, type DriveSyncDatabase } from '../../src/drive-sync/db/index.js';
import { fileViewOf, pushIntents } from '../../src/drive-sync/push-intents.js';
import {
  RootPusher,
  type PushAccepted,
  type PushConflict,
  type PushFailure,
} from '../../src/drive-sync/push.js';
import { SyncSocket } from '../../src/drive-sync/socket.js';
import { startFakeHub, TestTransport, until, type FakeHub, type HubPeer } from './hub-harness.js';

const log = new Logger('desktop.drive-sync');
const BLOCK = 128 * 1024;

interface Rig {
  readonly peer: HubPeer;
  readonly localPath: string;
  readonly database: DriveSyncDatabase;
  readonly pusher: RootPusher;
  readonly socket: SyncSocket;
  readonly accepted: PushAccepted[];
  readonly conflicted: PushConflict[];
  readonly stale: string[];
  readonly failed: PushFailure[];
  readonly attach: () => void;
  readonly connected: () => Promise<void>;
  readonly dropNextAccept: () => void;
}

let hub: FakeHub;
let scratch = '';
let transport: TestTransport;
let rigs: Rig[] = [];
let databases: DriveSyncDatabase[] = [];

beforeEach(async () => {
  hub = await startFakeHub();
  scratch = await mkdtemp(join(tmpdir(), 'drive-sync-push-'));
  transport = new TestTransport();
  rigs = [];
  databases = [];
});

afterEach(async () => {
  for (const rig of rigs) rig.socket.stop();
  transport.closeAll();
  for (const database of databases) database.close();
  await hub.stop();
  await rm(scratch, { recursive: true, force: true });
});

function bytesOf(blocks: number, fill: string): Buffer {
  return Buffer.from(fill.repeat(BLOCK * blocks - 7));
}

async function makeRig(name: string): Promise<Rig> {
  const peer = hub.peer(name);
  const localPath = join(scratch, name);
  await mkdir(localPath, { recursive: true });
  const database = openDriveSyncDatabase(join(scratch, `${name}.sqlite`), log);
  databases.push(database);
  const accepted: PushAccepted[] = [];
  const conflicted: PushConflict[] = [];
  const stale: string[] = [];
  const failed: PushFailure[] = [];
  let dropAccept = false;
  let opened = 0;
  const socket: SyncSocket = new SyncSocket({
    hubUrl: hub.url,
    token: peer.token,
    clientId: peer.clientId,
    transport,
    log,
    sink: {
      opened: (): void => {
        opened += 1;
        pusher.resume().catch((cause: unknown) => {
          log.error('test.resume_failed', cause);
        });
      },
      message: (_rootId, message): void => {
        if (dropAccept && message.type === 'accept') {
          dropAccept = false;
          pusher.interrupted();
          return;
        }
        pusher.receive(message);
      },
      closed: (): void => {
        pusher.interrupted();
      },
    },
  });
  const pusher: RootPusher = new RootPusher({
    rootId: hub.rootId,
    rootPath: localPath,
    database,
    channel: { send: (message) => socket.send(hub.rootId, message) },
    uploader: new HubBlockUploader({ hubUrl: hub.url, token: peer.token, fetch }),
    sink: {
      accepted: (result) => accepted.push(result),
      conflicted: (conflict) => conflicted.push(conflict),
      stale: (relPath) => stale.push(relPath),
      failed: (failure) => failed.push(failure),
    },
    log,
  });
  const rig: Rig = {
    peer,
    localPath,
    database,
    pusher,
    socket,
    accepted,
    conflicted,
    stale,
    failed,
    attach: () => {
      socket.attach({ rootId: hub.rootId, hello: () => ({ indexId: null, afterSeq: 0 }) });
    },
    connected: () => until(() => opened > 0 && socket.isOpen(hub.rootId)),
    dropNextAccept: () => {
      dropAccept = true;
    },
  };
  rigs.push(rig);
  return rig;
}

async function connectedRig(name: string): Promise<Rig> {
  const rig = await makeRig(name);
  rig.attach();
  await rig.connected();
  return rig;
}

async function putFile(
  rig: Rig,
  relPath: string,
  bytes: Buffer,
  hubRev: number | null = null,
): Promise<void> {
  const disk = join(rig.localPath, ...relPath.split('/'));
  await mkdir(dirname(disk), { recursive: true });
  await writeFile(disk, bytes);
  record(rig, relPath, bytes, hubRev);
}

function record(rig: Rig, relPath: string, bytes: Buffer, hubRev: number | null): void {
  const blockSize = blockSizeFor(bytes.length);
  const hashes: Buffer[] = [];
  for (let at = 0; at < bytes.length; at += blockSize) {
    hashes.push(
      createHash('sha256')
        .update(bytes.subarray(at, at + blockSize))
        .digest(),
    );
  }
  rig.database.files.upsert({
    rootId: hub.rootId,
    relPath,
    kind: 'file',
    bytes: bytes.length,
    mtimeNs: 1_700_000_000_000_000_000n,
    mode: 0o644,
    hubRev,
    localHashState: 'hashed',
    blockSize,
    blocks: Buffer.concat(hashes),
  });
}

function hubRevOf(rig: Rig, relPath: string): number | null | undefined {
  return rig.database.files.get(hub.rootId, relPath)?.hubRev;
}

function pushOf(rig: Rig, ...relPaths: string[]): Promise<void> {
  const view = fileViewOf(rig.database.files.list(hub.rootId));
  return rig.pusher.submit(
    pushIntents({ renames: [], changed: relPaths, deleted: [] }, view, view),
  );
}

describe('pushing content', () => {
  it('pushes a new file and records the hub revision', async () => {
    const rig = await connectedRig('desk');
    await putFile(rig, 'notes.txt', Buffer.from('hello hub'));
    await pushOf(rig, 'notes.txt');
    expect((await hub.readFile('notes.txt')).toString()).toBe('hello hub');
    expect(rig.accepted).toHaveLength(1);
    expect(rig.accepted[0]).toMatchObject({ kind: 'push', relPath: 'notes.txt' });
    expect(hubRevOf(rig, 'notes.txt')).toBe(hub.itemRev('notes.txt'));
    expect(rig.pusher.waiting()).toEqual({ needBytes: 0, pendingOps: 0 });
  });

  it('uploads only the blocks the hub asks for, across several blocks', async () => {
    const rig = await connectedRig('desk');
    const bytes = bytesOf(3, 'abc');
    await putFile(rig, 'deep/big.bin', bytes);
    await pushOf(rig, 'deep/big.bin');
    expect((await hub.readFile('deep/big.bin')).equals(bytes)).toBe(true);
    expect(rig.failed).toEqual([]);
  });

  it('pushes an edit against the revision the hub last accepted', async () => {
    const rig = await connectedRig('desk');
    await putFile(rig, 'a.txt', Buffer.from('one'));
    await pushOf(rig, 'a.txt');
    const first = hubRevOf(rig, 'a.txt');
    await putFile(rig, 'a.txt', Buffer.from('two!'), first ?? null);
    await pushOf(rig, 'a.txt');
    expect((await hub.readFile('a.txt')).toString()).toBe('two!');
    expect(rig.conflicted).toEqual([]);
    expect(hubRevOf(rig, 'a.txt')).toBeGreaterThan(first ?? 0);
  });

  it('reports a conflict and keeps the conflict copy path the hub names', async () => {
    const desk = await connectedRig('desk');
    const laptop = await connectedRig('laptop');
    await putFile(desk, 'shared.txt', Buffer.from('from the desk'));
    await pushOf(desk, 'shared.txt');
    await putFile(laptop, 'shared.txt', Buffer.from('from the laptop'));
    await pushOf(laptop, 'shared.txt');
    expect(laptop.conflicted).toHaveLength(1);
    expect(laptop.conflicted[0]).toMatchObject({ kind: 'push', reason: 'stale' });
    expect(laptop.conflicted[0]?.conflictPath).not.toBeNull();
    expect((await hub.readFile('shared.txt')).toString()).toBe('from the desk');
    expect(laptop.pusher.waiting().pendingOps).toBe(0);
  });
});

describe('moves and deletes', () => {
  it('sends a paired rename as a move', async () => {
    const rig = await connectedRig('desk');
    await putFile(rig, 'old.txt', Buffer.from('keep me'));
    await pushOf(rig, 'old.txt');
    const before = fileViewOf(rig.database.files.list(hub.rootId));
    await rename(join(rig.localPath, 'old.txt'), join(rig.localPath, 'new.txt'));
    rig.database.files.rename(hub.rootId, 'old.txt', 'new.txt');
    const after = fileViewOf(rig.database.files.list(hub.rootId));
    await rig.pusher.submit(
      pushIntents(
        { renames: [{ from: 'old.txt', to: 'new.txt', kind: 'file' }], changed: [], deleted: [] },
        before,
        after,
      ),
    );
    expect(hub.itemRev('old.txt')).toBeUndefined();
    expect((await hub.readFile('new.txt')).toString()).toBe('keep me');
    expect(rig.accepted.map((entry) => entry.kind)).toEqual(['push', 'move']);
    expect(hubRevOf(rig, 'new.txt')).toBe(hub.itemRev('new.txt'));
  });

  it('sends a delete as a tombstone against the known revision', async () => {
    const rig = await connectedRig('desk');
    await putFile(rig, 'gone.txt', Buffer.from('bye'));
    await pushOf(rig, 'gone.txt');
    const before = fileViewOf(rig.database.files.list(hub.rootId));
    rig.database.files.remove(hub.rootId, 'gone.txt');
    const after = fileViewOf(rig.database.files.list(hub.rootId));
    await rig.pusher.submit(
      pushIntents({ renames: [], changed: [], deleted: ['gone.txt'] }, before, after),
    );
    expect(hub.itemRev('gone.txt')).toBeUndefined();
    expect(rig.accepted.at(-1)).toMatchObject({ kind: 'tombstone', relPath: 'gone.txt' });
  });

  it('removes the files of a deleted folder before the folder itself', async () => {
    const rig = await connectedRig('desk');
    await putFile(rig, 'dir/sub/a.txt', Buffer.from('a'));
    await putFile(rig, 'dir/b.txt', Buffer.from('b'));
    await pushOf(rig, 'dir/sub/a.txt', 'dir/b.txt');
    for (const folder of ['dir', 'dir/sub']) {
      rig.database.files.upsert({
        rootId: hub.rootId,
        relPath: folder,
        kind: 'folder',
        bytes: 0,
        mtimeNs: 1n,
        mode: 0o755,
        hubRev: hub.itemRev(folder) ?? null,
        localHashState: 'hashed',
        blockSize: null,
        blocks: null,
      });
    }
    const before = fileViewOf(rig.database.files.list(hub.rootId));
    rig.database.files.removeSubtree(hub.rootId, 'dir');
    const after = fileViewOf(rig.database.files.list(hub.rootId));
    const intents = pushIntents({ renames: [], changed: [], deleted: ['dir'] }, before, after);
    expect(intents.map((intent) => (intent.kind === 'tombstone' ? intent.relPath : ''))).toEqual([
      'dir/sub/a.txt',
      'dir/b.txt',
      'dir/sub',
      'dir',
    ]);
    await rig.pusher.submit(intents);
    expect(rig.failed).toEqual([]);
    expect(rig.conflicted).toEqual([]);
    expect(hub.itemRev('dir')).toBeUndefined();
    expect(hub.itemRev('dir/b.txt')).toBeUndefined();
  });
});

describe('interrupted connections', () => {
  it('resends a push that lost its reply and the hub answers it once', async () => {
    const rig = await connectedRig('desk');
    await putFile(rig, 'once.txt', Buffer.from('exactly once'));
    rig.dropNextAccept();
    await pushOf(rig, 'once.txt');
    expect(rig.accepted).toEqual([]);
    expect(rig.pusher.waiting().pendingOps).toBe(1);
    const landed = hub.itemRev('once.txt');
    expect(landed).toBeDefined();
    await rig.pusher.resume();
    expect(rig.accepted).toHaveLength(1);
    expect(rig.accepted[0]?.rev).toBe(landed);
    expect(hub.itemRev('once.txt')).toBe(landed);
    expect(rig.pusher.waiting().pendingOps).toBe(0);
  });

  it('keeps one pending push per path while the hub is unreachable and sends it on connect', async () => {
    const rig = await makeRig('desk');
    await putFile(rig, 'late.txt', Buffer.from('first draft'));
    await pushOf(rig, 'late.txt');
    expect(rig.pusher.waiting()).toEqual({ needBytes: 11, pendingOps: 1 });
    await putFile(rig, 'late.txt', Buffer.from('second, longer draft'));
    await pushOf(rig, 'late.txt');
    expect(rig.pusher.waiting()).toEqual({ needBytes: 20, pendingOps: 1 });
    rig.attach();
    await until(() => rig.accepted.length === 1);
    expect((await hub.readFile('late.txt')).toString()).toBe('second, longer draft');
    expect(rig.pusher.waiting().pendingOps).toBe(0);
  });
});

describe('files that change under the push', () => {
  it('drops the push and marks the file stale when its content changed after hashing', async () => {
    const rig = await connectedRig('desk');
    const hashed = Buffer.from('aaaaaaaa');
    await putFile(rig, 'racy.txt', hashed);
    await writeFile(join(rig.localPath, 'racy.txt'), Buffer.from('bbbbbbbb'));
    await pushOf(rig, 'racy.txt');
    expect(rig.stale).toEqual(['racy.txt']);
    expect(rig.database.files.get(hub.rootId, 'racy.txt')?.localHashState).toBe('stale');
    expect(hub.itemRev('racy.txt')).toBeUndefined();
    expect(rig.pusher.waiting().pendingOps).toBe(0);
  });

  it('drops the push when the file is gone before its blocks are read', async () => {
    const rig = await connectedRig('desk');
    await putFile(rig, 'vanish.txt', Buffer.from('soon gone'));
    await rm(join(rig.localPath, 'vanish.txt'));
    await pushOf(rig, 'vanish.txt');
    expect(rig.stale).toEqual(['vanish.txt']);
    expect(rig.pusher.waiting().pendingOps).toBe(0);
  });

  it('skips a queued push whose record was removed before it was sent', async () => {
    const rig = await makeRig('desk');
    await putFile(rig, 'removed.txt', Buffer.from('queued'));
    await pushOf(rig, 'removed.txt');
    rig.database.files.remove(hub.rootId, 'removed.txt');
    rig.attach();
    await until(() => rig.pusher.waiting().pendingOps === 0);
    expect(hub.itemRev('removed.txt')).toBeUndefined();
    expect(rig.stale).toEqual([]);
  });
});
