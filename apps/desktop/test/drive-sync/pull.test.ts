import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  createIgnoreMatcher,
  type SyncHubMessage,
  type SyncIndexEntry,
} from '@smarteverything/domain/drive-sync';
import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BlockHasher } from '../../src/drive-sync/blocks.js';
import { openDriveSyncDatabase, type DriveSyncDatabase } from '../../src/drive-sync/db/index.js';
import {
  RootPuller,
  type PullChange,
  type PullContention,
  type PullProgress,
} from '../../src/drive-sync/pull.js';
import { scanRoot } from '../../src/drive-sync/scan.js';
import {
  BLOCK,
  FakeHubFiles,
  blockHashes,
  bytesOf,
  deletedOf,
  fileEntry,
  folderEntry,
} from './pull-support.js';

const log = new Logger('desktop.drive-sync');
const ROOT = randomUUID();
const INDEX_ID = randomUUID();

interface Rig {
  readonly puller: RootPuller;
  readonly hub: FakeHubFiles;
  readonly database: DriveSyncDatabase;
  readonly rootPath: string;
  readonly pulled: { readonly relPath: string; readonly change: PullChange }[];
  readonly contended: { readonly relPath: string; readonly reason: PullContention }[];
  readonly deferred: string[];
  readonly progress: PullProgress[];
  readonly blocked: { readonly relPath: string; readonly reason: 'disk_full' }[];
  readonly failed: { readonly relPath: string | null; readonly message: string }[];
  readonly unwanted: Set<string>;
}

let scratch = '';
let rig: Rig;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'drive-sync-pull-'));
  const rootPath = join(scratch, 'library');
  await mkdir(rootPath, { recursive: true });
  const database = openDriveSyncDatabase(join(scratch, 'client.sqlite'), log);
  const hub = new FakeHubFiles();
  const unwanted = new Set<string>();
  const pulled: Rig['pulled'] = [];
  const contended: Rig['contended'] = [];
  const deferred: string[] = [];
  const progress: PullProgress[] = [];
  const blocked: Rig['blocked'] = [];
  const failed: Rig['failed'] = [];
  rig = {
    puller: new RootPuller({
      rootId: ROOT,
      rootPath,
      platform: process.platform,
      database,
      source: hub,
      wants: (relPath): boolean => !unwanted.has(relPath),
      sink: {
        pulled: (result): void => {
          pulled.push(result);
        },
        contended: (result): void => {
          contended.push(result);
        },
        deferred: (relPath): void => {
          deferred.push(relPath);
        },
        progress: (entry): void => {
          progress.push(entry);
        },
        blocked: (result): void => {
          blocked.push(result);
        },
        failed: (failure): void => {
          failed.push(failure);
        },
      },
      log,
    }),
    hub,
    database,
    rootPath,
    pulled,
    contended,
    deferred,
    progress,
    blocked,
    failed,
    unwanted,
  };
});

afterEach(async () => {
  rig.database.close();
  await rm(scratch, { recursive: true, force: true });
});

function publish(relPath: string, content: Buffer, rev: number): SyncIndexEntry {
  const itemId = randomUUID();
  rig.hub.contents.set(itemId, content);
  return fileEntry(itemId, relPath, content, rev);
}

function republish(entry: SyncIndexEntry, content: Buffer, rev: number): SyncIndexEntry {
  rig.hub.contents.set(entry.itemId, content);
  return fileEntry(entry.itemId, entry.relPath, content, rev);
}

async function deliver(message: SyncHubMessage): Promise<void> {
  rig.puller.receive(message);
  await rig.puller.settled();
}

function fullIndex(entries: readonly SyncIndexEntry[], seq = 7, last = true): SyncHubMessage {
  return { type: 'index', indexId: INDEX_ID, seq, entries, last };
}

function update(entries: readonly SyncIndexEntry[], seq: number): SyncHubMessage {
  return { type: 'index_update', seq, entries };
}

function disk(relPath: string): string {
  return join(rig.rootPath, ...relPath.split('/'));
}

async function localFile(relPath: string, content: Buffer, hubRev: number | null): Promise<void> {
  await mkdir(dirname(disk(relPath)), { recursive: true });
  await writeFile(disk(relPath), content);
  const info = await lstat(disk(relPath), { bigint: true });
  rig.database.files.upsert({
    rootId: ROOT,
    relPath,
    kind: 'file',
    bytes: content.length,
    mtimeNs: info.mtimeNs,
    mode: Number(info.mode & 0o777n),
    hubRev,
    localHashState: 'hashed',
    blockSize: BLOCK,
    blocks: blockHashes(content),
  });
}

describe('the first index', () => {
  it('creates folders and files, records them and keeps the cursor at the last page', async () => {
    const note = publish('docs/notes.txt', bytesOf(2, 'a'), 3);
    await deliver(fullIndex([folderEntry('docs', 1), note], 9));
    expect(await readFile(disk('docs/notes.txt'))).toEqual(bytesOf(2, 'a'));
    const record = rig.database.files.get(ROOT, 'docs/notes.txt');
    expect(record).toMatchObject({
      kind: 'file',
      hubRev: 3,
      localHashState: 'hashed',
      bytes: bytesOf(2, 'a').length,
    });
    expect(Buffer.from(record?.blocks ?? [])).toEqual(blockHashes(bytesOf(2, 'a')));
    expect(rig.database.files.get(ROOT, 'docs')).toMatchObject({ kind: 'folder', hubRev: 1 });
    expect(rig.database.cursors.get(ROOT)).toEqual({
      rootId: ROOT,
      indexId: INDEX_ID,
      lastSeq: 9,
    });
    expect(rig.puller.hello()).toEqual({ indexId: INDEX_ID, afterSeq: 9 });
    expect(rig.pulled.map((entry) => entry.relPath).sort()).toEqual(['docs', 'docs/notes.txt']);
    expect(rig.database.transfers.list()).toEqual([]);
    expect((await stat(disk('docs/notes.txt'))).mtime.toISOString()).toBe(
      '2026-11-01T10:00:00.000Z',
    );
  });

  it('leaves no temp file behind and keeps the cursor back until the last page', async () => {
    await deliver(fullIndex([publish('a.txt', bytesOf(1, 'a'), 1)], 4, false));
    expect(rig.database.cursors.get(ROOT)).toBeUndefined();
    expect(rig.puller.hello()).toEqual({ indexId: null, afterSeq: 0 });
    await deliver(fullIndex([publish('b.txt', bytesOf(1, 'b'), 1)], 4, true));
    expect(rig.database.cursors.get(ROOT)?.lastSeq).toBe(4);
    await expect(stat(join(rig.rootPath, '.a.txt.sync-tmp'))).rejects.toThrow();
  });

  it('forgets the hub revision of files a rebuilt index no longer lists so they are pushed again', async () => {
    await localFile('kept.txt', bytesOf(1, 'k'), 5);
    await localFile('fresh.txt', bytesOf(1, 'f'), null);
    await deliver(fullIndex([publish('other.txt', bytesOf(1, 'o'), 1)]));
    expect(rig.database.files.get(ROOT, 'kept.txt')?.hubRev).toBeNull();
    expect(await readFile(disk('kept.txt'))).toEqual(bytesOf(1, 'k'));
  });

  it('only records the hub revision when the same content is already on disk', async () => {
    const entry = publish('same.txt', bytesOf(2, 's'), 4);
    await localFile('same.txt', bytesOf(2, 's'), null);
    await deliver(fullIndex([entry]));
    expect(rig.hub.fetched).toEqual([]);
    expect(rig.database.files.get(ROOT, 'same.txt')?.hubRev).toBe(4);
    expect(rig.pulled).toEqual([]);
  });

  it('keeps a different local file that exists on both sides for the conflict flow', async () => {
    await localFile('both.txt', bytesOf(1, 'x'), null);
    await deliver(fullIndex([publish('both.txt', bytesOf(1, 'y'), 2)]));
    expect(rig.contended).toEqual([{ relPath: 'both.txt', reason: 'new_on_both' }]);
    expect(await readFile(disk('both.txt'))).toEqual(bytesOf(1, 'x'));
  });
});

describe('echo suppression', () => {
  it('records the written file so the next scan sees it as unchanged', async () => {
    await deliver(fullIndex([publish('echo.txt', bytesOf(2, 'e'), 1)]));
    const hasher: BlockHasher = {
      hash: () => Promise.reject(new Error('the pulled file must not be hashed again')),
      close: () => Promise.resolve(),
    };
    const result = await scanRoot({
      rootId: ROOT,
      rootPath: rig.rootPath,
      previous: rig.database.files.list(ROOT),
      ignore: createIgnoreMatcher([]),
      hasher,
      platform: process.platform,
      portablePaths: false,
      mtimeToleranceNs: 0n,
      quietMs: 0,
      now: () => Date.now(),
      log,
    });
    expect(result.upserts).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.unchanged).toBe(1);
  });

  it('adopts the revision of an update that echoes the content just pushed', async () => {
    rig.database.cursors.set({ rootId: ROOT, indexId: INDEX_ID, lastSeq: 1 });
    await localFile('mine.txt', bytesOf(2, 'm'), 1);
    await deliver(update([publish('mine.txt', bytesOf(2, 'm'), 2)], 3));
    expect(rig.hub.fetched).toEqual([]);
    expect(rig.database.files.get(ROOT, 'mine.txt')?.hubRev).toBe(2);
  });
});

describe('index updates', () => {
  it('downloads only the changed block of an edited file', async () => {
    const original = bytesOf(3, 'a');
    const first = publish('big.bin', original, 1);
    await deliver(fullIndex([first], 2));
    const edited = Buffer.from(original);
    edited.fill('z', 2 * BLOCK, edited.length);
    rig.hub.fetched.length = 0;
    await deliver(update([republish(first, edited, 2)], 3));
    expect(rig.hub.fetched).toEqual([`${first.itemId}:2`]);
    expect(await readFile(disk('big.bin'))).toEqual(edited);
    expect(rig.database.files.get(ROOT, 'big.bin')?.hubRev).toBe(2);
    expect(rig.database.cursors.get(ROOT)?.lastSeq).toBe(3);
    expect(rig.pulled.at(-1)).toEqual({ relPath: 'big.bin', change: 'updated' });
  });

  it('removes a file the hub deleted', async () => {
    const entry = publish('gone.txt', bytesOf(1, 'g'), 1);
    await deliver(fullIndex([entry]));
    await deliver(update([deletedOf(entry, 2)], 8));
    await expect(stat(disk('gone.txt'))).rejects.toThrow();
    expect(rig.database.files.get(ROOT, 'gone.txt')).toBeUndefined();
    expect(rig.pulled.at(-1)).toEqual({ relPath: 'gone.txt', change: 'deleted' });
  });

  it('removes a deleted folder with its synced files', async () => {
    const folder = folderEntry('dir', 1);
    await deliver(fullIndex([folder, publish('dir/a.txt', bytesOf(1, 'a'), 1)]));
    await deliver(update([deletedOf(folder, 2)], 9));
    await expect(stat(disk('dir'))).rejects.toThrow();
    expect(rig.database.files.list(ROOT)).toEqual([]);
  });

  it('keeps a deleted folder that still holds an unsynced local file', async () => {
    const folder = folderEntry('dir', 1);
    await deliver(fullIndex([folder]));
    await localFile('dir/new.txt', bytesOf(1, 'n'), null);
    await deliver(update([deletedOf(folder, 2)], 9));
    expect(rig.contended).toEqual([{ relPath: 'dir/new.txt', reason: 'local_edit' }]);
    expect(await readFile(disk('dir/new.txt'))).toEqual(bytesOf(1, 'n'));
  });

  it('does not overwrite a file with a push waiting for the hub', async () => {
    const first = publish('doc.txt', bytesOf(1, 'a'), 1);
    await deliver(fullIndex([first]));
    await localFile('doc.txt', bytesOf(1, 'b'), 1);
    rig.database.pendingOps.enqueue({
      opId: randomUUID(),
      kind: 'push',
      payload: {
        relPath: 'doc.txt',
        meta: {
          bytes: 1,
          mtime: '2026-11-01T10:00:00.000Z',
          blockSize: BLOCK,
          blocksHash: 'a'.repeat(64),
        },
        blocks: 'a'.repeat(64),
      },
    });
    await deliver(update([republish(first, bytesOf(1, 'c'), 2)], 4));
    expect(rig.contended).toEqual([{ relPath: 'doc.txt', reason: 'local_edit' }]);
    expect(await readFile(disk('doc.txt'))).toEqual(bytesOf(1, 'b'));
  });

  it('does not overwrite a file edited on disk since it was last scanned', async () => {
    const first = publish('live.txt', bytesOf(1, 'a'), 1);
    await deliver(fullIndex([first]));
    await writeFile(disk('live.txt'), 'typed since the scan');
    await deliver(update([republish(first, bytesOf(1, 'c'), 2)], 4));
    expect(rig.contended).toEqual([{ relPath: 'live.txt', reason: 'local_edit' }]);
    expect(await readFile(disk('live.txt'), 'utf8')).toBe('typed since the scan');
  });

  it('leaves unwanted files to selective sync', async () => {
    rig.unwanted.add('skip.txt');
    await deliver(fullIndex([publish('skip.txt', bytesOf(1, 's'), 1)]));
    expect(rig.deferred).toEqual(['skip.txt']);
    await expect(stat(disk('skip.txt'))).rejects.toThrow();
    expect(rig.database.files.get(ROOT, 'skip.txt')).toBeUndefined();
  });

  it('drops a download whose content the hub replaced meanwhile', async () => {
    const entry = publish('moving.txt', bytesOf(2, 'a'), 1);
    rig.hub.contents.set(entry.itemId, bytesOf(2, 'b'));
    await deliver(fullIndex([entry, publish('next.txt', bytesOf(1, 'n'), 1)]));
    await expect(stat(disk('moving.txt'))).rejects.toThrow();
    expect(await readFile(disk('next.txt'))).toEqual(bytesOf(1, 'n'));
    expect(rig.failed).toEqual([]);
  });
});

describe('a dropped transfer', () => {
  it('halts, keeps the cursor back and resumes from the verified blocks after reconnecting', async () => {
    const entry = publish('large.bin', bytesOf(4, 'l'), 1);
    rig.hub.failAt = { itemId: entry.itemId, index: 2 };
    const message = fullIndex([entry], 5);
    await deliver(message);
    expect(rig.failed).toEqual([{ relPath: 'large.bin', message: 'connection dropped' }]);
    expect(rig.database.cursors.get(ROOT)).toBeUndefined();
    expect(rig.database.transfers.list()).toHaveLength(1);
    await deliver(fullIndex([publish('late.txt', bytesOf(1, 'x'), 1)], 6));
    await expect(stat(disk('late.txt'))).rejects.toThrow();
    rig.hub.fetched.length = 0;
    rig.puller.reopened();
    await deliver(message);
    expect(rig.hub.fetched).toEqual([`${entry.itemId}:2`, `${entry.itemId}:3`]);
    expect(await readFile(disk('large.bin'))).toEqual(bytesOf(4, 'l'));
    expect(rig.database.cursors.get(ROOT)?.lastSeq).toBe(5);
    expect(rig.progress.some((entryProgress) => entryProgress.resumedBytes === 2 * BLOCK)).toBe(
      true,
    );
    expect(rig.database.transfers.list()).toEqual([]);
  });

  it('reports a corrupt block as a failure and writes nothing final', async () => {
    const entry = publish('bad.bin', bytesOf(2, 'b'), 1);
    rig.hub.corrupt = { itemId: entry.itemId, index: 1 };
    await deliver(fullIndex([entry]));
    expect(rig.failed[0]?.relPath).toBe('bad.bin');
    await expect(stat(disk('bad.bin'))).rejects.toThrow();
  });

  it('refuses an update before any index', async () => {
    await deliver(update([publish('early.txt', bytesOf(1, 'e'), 1)], 2));
    expect(rig.failed).toHaveLength(1);
    await expect(stat(disk('early.txt'))).rejects.toThrow();
  });
});
