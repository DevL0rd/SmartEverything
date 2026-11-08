import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDriveSyncDatabase, type DriveSyncDatabase } from '../../src/drive-sync/db/index.js';
import {
  BlockCorruptError,
  HubBlockSource,
  LocalBlockIndex,
  RemoteChangedError,
  downloadFile,
  itemKeyOf,
  type LocalBlocks,
  type TransferProgress,
} from '../../src/drive-sync/transfer.js';
import { BLOCK, FakeHubFiles, blockHashes, bytesOf, remoteOf } from './pull-support.js';

const log = new Logger('desktop.drive-sync');
const ROOT = randomUUID();
const TXN = `pull:${ROOT}`;
const NO_LOCAL: LocalBlocks = { read: () => Promise.resolve(null) };

let scratch = '';
let database: DriveSyncDatabase;
let hub: FakeHubFiles;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'drive-sync-transfer-'));
  database = openDriveSyncDatabase(join(scratch, 'client.sqlite'), log);
  hub = new FakeHubFiles();
});

afterEach(async () => {
  database.close();
  await rm(scratch, { recursive: true, force: true });
});

function stored(content: Buffer): ReturnType<typeof remoteOf> {
  const itemId = randomUUID();
  hub.contents.set(itemId, content);
  return remoteOf(ROOT, itemId, content);
}

function run(
  remote: ReturnType<typeof remoteOf>,
  local: LocalBlocks = NO_LOCAL,
  progress: TransferProgress[] = [],
): ReturnType<typeof downloadFile> {
  return downloadFile({
    relPath: 'big.bin',
    txn: TXN,
    remote,
    tempPath: join(scratch, '.big.bin.sync-tmp'),
    database,
    source: hub,
    local,
    progress: (entry) => progress.push(entry),
  });
}

describe('downloading a file into a temp file', () => {
  it('writes every verified block and records them in the bitmap', async () => {
    const content = bytesOf(3, 'a');
    const remote = stored(content);
    const progress: TransferProgress[] = [];
    const blocks = await run(remote, NO_LOCAL, progress);
    expect(await readFile(join(scratch, '.big.bin.sync-tmp'))).toEqual(content);
    expect(Buffer.from(blocks)).toEqual(blockHashes(content));
    expect(database.transfers.get(TXN, itemKeyOf(remote))?.verified).toEqual([true, true, true]);
    expect(progress.at(-1)).toEqual({
      doneBytes: content.length,
      totalBytes: content.length,
      resumedBytes: 0,
    });
  });

  it('takes blocks the local files already hold before asking the hub', async () => {
    const content = bytesOf(3, 'b');
    const remote = stored(content);
    const heldPath = join(scratch, 'held.bin');
    await writeFile(heldPath, content);
    const index = new LocalBlockIndex({
      records: [
        {
          rootId: ROOT,
          relPath: 'held.bin',
          kind: 'file',
          bytes: content.length,
          mtimeNs: 0n,
          mode: 0o644,
          hubRev: 1,
          localHashState: 'hashed',
          blockSize: remote.blockSize,
          blocks: blockHashes(content),
          pinned: false,
        },
      ],
      rootPath: scratch,
      platform: process.platform,
      log,
    });
    await run(remote, index);
    expect(hub.fetched).toEqual([]);
    expect(await readFile(join(scratch, '.big.bin.sync-tmp'))).toEqual(content);
  });

  it('refuses a local block that no longer matches its hash', async () => {
    const content = bytesOf(2, 'c');
    const remote = stored(content);
    await writeFile(join(scratch, 'held.bin'), Buffer.alloc(content.length, 1));
    const index = new LocalBlockIndex({
      records: [
        {
          rootId: ROOT,
          relPath: 'held.bin',
          kind: 'file',
          bytes: content.length,
          mtimeNs: 0n,
          mode: 0o644,
          hubRev: 1,
          localHashState: 'hashed',
          blockSize: remote.blockSize,
          blocks: blockHashes(content),
          pinned: false,
        },
      ],
      rootPath: scratch,
      platform: process.platform,
      log,
    });
    await run(remote, index);
    expect(hub.fetched).toHaveLength(2);
    expect(await readFile(join(scratch, '.big.bin.sync-tmp'))).toEqual(content);
  });

  it('rejects a block whose bytes do not match the verified hash', async () => {
    const content = bytesOf(3, 'd');
    const remote = stored(content);
    hub.corrupt = { itemId: remote.itemId, index: 1 };
    await expect(run(remote)).rejects.toBeInstanceOf(BlockCorruptError);
    expect(database.transfers.get(TXN, itemKeyOf(remote))?.verified).toEqual([true, false, false]);
  });

  it('rejects a hash list that does not belong to the indexed content', async () => {
    const remote = stored(bytesOf(2, 'e'));
    hub.contents.set(remote.itemId, bytesOf(2, 'f'));
    await expect(run(remote)).rejects.toBeInstanceOf(RemoteChangedError);
  });

  it('resumes after a dropped transfer and fetches only the missing blocks', async () => {
    const content = bytesOf(4, 'g');
    const remote = stored(content);
    hub.failAt = { itemId: remote.itemId, index: 2 };
    await expect(run(remote)).rejects.toThrow('connection dropped');
    expect(database.transfers.get(TXN, itemKeyOf(remote))?.verified).toEqual([
      true,
      true,
      false,
      false,
    ]);
    hub.fetched.length = 0;
    const progress: TransferProgress[] = [];
    await run(remote, NO_LOCAL, progress);
    expect(hub.fetched).toEqual([`${remote.itemId}:2`, `${remote.itemId}:3`]);
    expect(progress[0]).toEqual({
      doneBytes: 2 * BLOCK,
      totalBytes: content.length,
      resumedBytes: 2 * BLOCK,
    });
    expect(await readFile(join(scratch, '.big.bin.sync-tmp'))).toEqual(content);
  });

  it('starts over when the content changed on the hub since the interrupted transfer', async () => {
    const itemId = randomUUID();
    const first = bytesOf(3, 'h');
    hub.contents.set(itemId, first);
    hub.failAt = { itemId, index: 1 };
    await expect(run(remoteOf(ROOT, itemId, first))).rejects.toThrow('connection dropped');
    const second = bytesOf(3, 'i');
    hub.contents.set(itemId, second);
    await run(remoteOf(ROOT, itemId, second));
    expect(await readFile(join(scratch, '.big.bin.sync-tmp'))).toEqual(second);
    expect(database.transfers.list().map((entry) => entry.item)).toEqual([
      itemKeyOf(remoteOf(ROOT, itemId, second)),
    ]);
  });

  it('writes an empty file without any block', async () => {
    const remote = stored(Buffer.alloc(0));
    await run(remote);
    expect((await stat(join(scratch, '.big.bin.sync-tmp'))).size).toBe(0);
  });
});

describe('the hub block source', () => {
  let server: Server;
  let url = '';
  let requests: string[] = [];
  let status = 200;

  beforeEach(async () => {
    requests = [];
    status = 200;
    server = createServer((request, response) => {
      requests.push(`${request.url ?? ''} ${request.headers.authorization ?? ''}`);
      response.writeHead(status);
      response.end(Buffer.from('payload'));
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('no port');
    url = `http://127.0.0.1:${String(address.port)}`;
  });

  afterEach(() => {
    server.closeAllConnections();
    server.close();
  });

  it('asks for the hash list and for single blocks with the bearer token', async () => {
    const source = new HubBlockSource({ hubUrl: url, token: 'tok', fetch });
    const remote = remoteOf(ROOT, randomUUID(), bytesOf(1, 'j'));
    expect(Buffer.from(await source.hashes(remote)).toString()).toBe('payload');
    await source.block(remote, 3);
    expect(requests).toEqual([
      `/drive/blocks/${ROOT}/${remote.itemId} Bearer tok`,
      `/drive/blocks/${ROOT}/${remote.itemId}/3 Bearer tok`,
    ]);
  });

  it('reports a vanished or replaced file as a changed remote', async () => {
    const source = new HubBlockSource({ hubUrl: url, token: 'tok', fetch });
    const remote = remoteOf(ROOT, randomUUID(), bytesOf(1, 'k'));
    status = 409;
    await expect(source.block(remote, 0)).rejects.toBeInstanceOf(RemoteChangedError);
    status = 404;
    await expect(source.hashes(remote)).rejects.toBeInstanceOf(RemoteChangedError);
  });

  it('fails on any other refusal', async () => {
    const source = new HubBlockSource({ hubUrl: url, token: 'tok', fetch });
    const remote = remoteOf(ROOT, randomUUID(), bytesOf(1, 'l'));
    status = 500;
    await expect(source.block(remote, 0)).rejects.toThrow('500');
  });
});
