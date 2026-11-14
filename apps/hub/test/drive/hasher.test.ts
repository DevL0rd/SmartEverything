import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DriveItem } from '@smarteverything/domain';
import { blockSizeFor, unpackHashes } from '@smarteverything/domain/drive-sync';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashHandle, hashRequested } from '../../src/drive/blocks';
import {
  byPriority,
  collectBacklog,
  hashHandler,
  type HashEnvironment,
} from '../../src/drive/hasher';
import { scanHandler, type ScanEnvironment } from '../../src/drive/jobs';
import { updateDriveSettings } from '../../src/drive/settings';
import { testLogger } from '../support/logs';
import { bundleWorker, driveRoot, NOW, openDriveFixture, type DriveFixture } from './drive-fixture';

const ROOT = '0d000000-0000-4000-8000-000000000002';

let bundleFolder = '';
let scannerScript = '';
let hasherScript = '';
let tree = '';
let fixture: DriveFixture;
let roots: DriveFixture['roots'];
let items: DriveFixture['items'];
let blocks: DriveFixture['blocks'];
let settings: DriveFixture['settings'];
let feed: DriveFixture['feed'];
let context: DriveFixture['context'];
let progress: { readonly phase: string; readonly done: number; readonly total: number }[];

beforeAll(async () => {
  bundleFolder = mkdtempSync(join(tmpdir(), 'hasher-bundle-'));
  scannerScript = join(bundleFolder, 'scanner-worker.mjs');
  hasherScript = join(bundleFolder, 'hasher-worker.mjs');
  await bundleWorker('scanner-worker.ts', scannerScript);
  await bundleWorker('hasher-worker.ts', hasherScript);
});

afterAll(() => {
  rmSync(bundleFolder, { recursive: true, force: true });
});

function useRoot(synced: boolean): void {
  fixture.addDrive(driveRoot(ROOT), tree);
  if (synced) fixture.syncRoot(ROOT);
}

beforeEach(() => {
  tree = mkdtempSync(join(tmpdir(), 'hasher-tree-'));
  fixture = openDriveFixture();
  ({ roots, items, blocks, settings, feed, context } = fixture);
  progress = [];
  feed.subscribeNotices((notice) => {
    if (notice.type === 'drive_progress') {
      progress.push({ phase: notice.phase, done: notice.done, total: notice.total });
    }
  });
});

afterEach(() => {
  fixture.database.close();
  rmSync(tree, { recursive: true, force: true });
});

function put(path: string, content: string | Buffer = 'x'): void {
  const full = join(tree, path);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
}

function indexed(path: string): DriveItem {
  const item = items.byPath(ROOT, path, null);
  if (item === undefined) throw new Error(`${path} is not indexed`);
  return item;
}

const blocksOf = (item: DriveItem): ReturnType<DriveFixture['blocks']['find']> =>
  blocks.find(item.id, item.rev);

const signal = (): AbortSignal => new AbortController().signal;

async function scan(): Promise<void> {
  const env: ScanEnvironment = {
    store: {
      driveRoots: roots,
      driveItems: items,
      feed,
      write: (work) => context.write(work),
      now: () => new Date(NOW),
    },
    availability: () => Promise.resolve('online'),
    workerScript: scannerScript,
    log: testLogger(),
  };
  await scanHandler(env)({ kind: 'scan', rootId: ROOT }, signal());
}

function hashEnvironment(): HashEnvironment {
  return {
    store: {
      driveRoots: roots,
      driveItems: items,
      driveBlocks: blocks,
      drivePlacements: fixture.placements,
      settingsKv: settings,
      feed,
      write: (work) => context.write(work),
    },
    availability: () => Promise.resolve('online'),
    workerScript: hasherScript,
    log: testLogger(),
  };
}

async function hash(controller: AbortSignal = signal()): Promise<void> {
  await hashHandler(hashEnvironment())({ kind: 'hash', rootId: ROOT }, controller);
}

const sha = (content: string | Buffer): string =>
  createHash('sha256').update(content).digest('hex');

describe('hashing a file in blocks', () => {
  it('computes the whole-file digest and one digest per block, the last one partial', async () => {
    const content = Buffer.alloc(300 * 1024, 7);
    put('big.bin', content);
    const handle = await open(join(tree, 'big.bin'));
    const result = await hashHandle(handle, content.length, true);
    await handle.close();
    const size = blockSizeFor(content.length);
    expect(result).toMatchObject({ sha256: sha(content), bytes: content.length });
    expect(result.blocks?.blockSize).toBe(size);
    expect(unpackHashes(Buffer.from(result.blocks?.hashes ?? []).toString('hex'))).toEqual([
      sha(content.subarray(0, size)),
      sha(content.subarray(size, size * 2)),
      sha(content.subarray(size * 2)),
    ]);
  });

  it('gives an empty file the empty digest and no blocks', async () => {
    put('empty.bin', '');
    const handle = await open(join(tree, 'empty.bin'));
    const result = await hashHandle(handle, 0, true);
    await handle.close();
    expect(result.sha256).toBe(sha(''));
    expect(result.blocks?.hashes.length).toBe(0);
  });

  it('hashes without block lists when none are wanted', async () => {
    put('a.txt', 'hello');
    const handle = await open(join(tree, 'a.txt'));
    const result = await hashHandle(handle, 5, false);
    await handle.close();
    expect(result).toEqual({ sha256: sha('hello'), bytes: 5, blocks: null });
  });
});

describe('answering a hash request', () => {
  it('refuses a file whose identity is not the indexed one', async () => {
    put('a.txt', 'hello');
    const answer = await hashRequested({
      id: 1,
      rootPath: tree,
      relPath: 'a.txt',
      dev: '1',
      ino: '1',
      withBlocks: false,
    });
    expect(answer).toMatchObject({ kind: 'skipped', reason: 'changed' });
  });

  it('reports a vanished file as missing', async () => {
    const answer = await hashRequested({
      id: 2,
      rootPath: tree,
      relPath: 'gone.txt',
      dev: '1',
      ino: '1',
      withBlocks: false,
    });
    expect(answer).toMatchObject({ kind: 'skipped', reason: 'missing' });
  });

  it('never follows a symlink out of the root', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'hasher-outside-'));
    try {
      writeFileSync(join(outside, 'secret.txt'), 'secret');
      symlinkSync(join(outside, 'secret.txt'), join(tree, 'link.txt'));
      const answer = await hashRequested({
        id: 3,
        rootPath: tree,
        relPath: 'link.txt',
        dev: '1',
        ino: '1',
        withBlocks: false,
      });
      expect(answer.kind).toBe('skipped');
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe('the hash job', () => {
  it('stores the digest of every file in a synced root with its block list, off the main thread', async () => {
    useRoot(true);
    const content = Buffer.alloc(300 * 1024, 3);
    put('docs/a.txt', 'hello');
    put('b.bin', content);
    await scan();
    const before = indexed('docs/a.txt');
    await hash();
    const a = indexed('docs/a.txt');
    const b = indexed('b.bin');
    expect(a).toMatchObject({ sha256: sha('hello'), rev: before.rev + 1 });
    expect(b).toMatchObject({ sha256: sha(content), bytes: content.length });
    const stored = blocksOf(b);
    expect(stored?.blockSize).toBe(blockSizeFor(content.length));
    expect(stored?.hashes.length).toBe(3 * 32);
    expect(blocksOf(a)?.hashes.length).toBe(32);
    expect(roots.byId(ROOT).health.hashedShare).toBe(1);
    expect(progress.filter((entry) => entry.phase === 'hash').at(-1)).toEqual({
      phase: 'hash',
      done: 2,
      total: 2,
    });
  });

  it('keeps no older block list once a newer one is stored', async () => {
    useRoot(true);
    put('a.txt', 'hello');
    await scan();
    const first = indexed('a.txt');
    blocks.put({
      itemId: first.id,
      rev: first.rev,
      blockSize: 131072,
      hashes: new Uint8Array(32),
    });
    await hash();
    const hashed = indexed('a.txt');
    expect(blocksOf(first)).toBeUndefined();
    expect(blocksOf(hashed)).toBeDefined();
  });

  it('hashes a root that is not synced only while duplicate finding is on, and without block lists', async () => {
    useRoot(false);
    put('a.txt', 'hello');
    await scan();
    updateDriveSettings(
      { settingsKv: settings, write: (work) => context.write(work) },
      { duplicatesHashing: false },
    );
    await hash();
    expect(items.byPath(ROOT, 'a.txt', null)).toMatchObject({ sha256: null });
    updateDriveSettings(
      { settingsKv: settings, write: (work) => context.write(work) },
      { duplicatesHashing: true },
    );
    await hash();
    const hashed = indexed('a.txt');
    expect(hashed).toMatchObject({ sha256: sha('hello') });
    expect(blocksOf(hashed)).toBeUndefined();
  });

  it('does nothing while indexing is paused', async () => {
    useRoot(true);
    put('a.txt', 'hello');
    await scan();
    updateDriveSettings(
      { settingsKv: settings, write: (work) => context.write(work) },
      { indexingPaused: true },
    );
    await hash();
    expect(items.byPath(ROOT, 'a.txt', null)).toMatchObject({ sha256: null });
  });

  it('drops a digest when the file changed after the scan and leaves the rev alone', async () => {
    useRoot(true);
    put('a.txt', 'hello');
    await scan();
    const before = indexed('a.txt');
    put('a.txt', 'hello world');
    utimesSync(
      join(tree, 'a.txt'),
      new Date('2030-01-01T00:00:00Z'),
      new Date('2030-01-01T00:00:00Z'),
    );
    await hash();
    expect(items.byPath(ROOT, 'a.txt', null)).toEqual(before);
    expect(blocksOf(before)).toBeUndefined();
  });

  it('is idempotent: a second run finds nothing to hash and bumps no rev', async () => {
    useRoot(true);
    put('a.txt', 'hello');
    await scan();
    await hash();
    const settled = indexed('a.txt');
    await hash();
    expect(items.byPath(ROOT, 'a.txt', null)).toEqual(settled);
  });

  it('keeps the digest across a rescan of an unchanged file', async () => {
    useRoot(true);
    put('a.txt', 'hello');
    await scan();
    await hash();
    const settled = indexed('a.txt');
    await scan();
    expect(items.byPath(ROOT, 'a.txt', null)).toEqual(settled);
  });

  it('clears the digest when the file changes, so it is hashed again', async () => {
    useRoot(true);
    put('a.txt', 'hello');
    await scan();
    await hash();
    put('a.txt', 'changed!');
    utimesSync(
      join(tree, 'a.txt'),
      new Date('2031-01-01T00:00:00Z'),
      new Date('2031-01-01T00:00:00Z'),
    );
    await scan();
    expect(items.byPath(ROOT, 'a.txt', null)).toMatchObject({ sha256: null });
    await hash();
    expect(items.byPath(ROOT, 'a.txt', null)).toMatchObject({ sha256: sha('changed!') });
  });

  it('stops hashing when cancelled', async () => {
    useRoot(true);
    put('a.txt', 'hello');
    await scan();
    const controller = new AbortController();
    controller.abort();
    await hash(controller.signal);
    expect(items.byPath(ROOT, 'a.txt', null)).toMatchObject({ sha256: null });
  });
});

describe('the backlog order', () => {
  it('puts opened files first, newest opening first, then small files, then by path', async () => {
    useRoot(false);
    put('big.bin', Buffer.alloc(5000));
    put('small.bin', Buffer.alloc(10));
    put('opened-old.bin', Buffer.alloc(9000));
    put('opened-new.bin', Buffer.alloc(9000));
    await scan();
    const idOf = (path: string): string => indexed(path).id;
    items.markOpened(idOf('opened-old.bin'), '2026-01-01T00:00:00.000Z');
    items.markOpened(idOf('opened-new.bin'), '2026-06-01T00:00:00.000Z');
    const backlog = collectBacklog(
      { driveItems: items, driveBlocks: blocks, drivePlacements: fixture.placements },
      roots.byId(ROOT),
    );
    expect(backlog.candidates.map((candidate) => candidate.relPath)).toEqual([
      'opened-new.bin',
      'opened-old.bin',
      'small.bin',
      'big.bin',
    ]);
    expect(backlog).toMatchObject({ files: 4, hashed: 0 });
  });

  it('orders two equal files by path', () => {
    const base = {
      id: 'x',
      bytes: 1,
      openedAt: null,
      dev: '1',
      ino: '1',
      wantBlocks: false,
    } as const;
    expect(byPriority({ ...base, relPath: 'a' }, { ...base, relPath: 'b' })).toBeLessThan(0);
    expect(byPriority({ ...base, relPath: 'b' }, { ...base, relPath: 'a' })).toBeGreaterThan(0);
  });
});
