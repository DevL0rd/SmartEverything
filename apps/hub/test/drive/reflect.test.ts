import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DriveRoot } from '@smarteverything/domain';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mergeJobs, scanHandler, type ScanEnvironment } from '../../src/drive/jobs';
import { reflectHandler } from '../../src/drive/reflect';
import { DriveRootLanes } from '../../src/drive/root-lanes';
import { scopesOf } from '../../src/drive/scanner-scope';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { DriveInodesRepository } from '../../src/store/repositories/drive-inodes';
import { DriveItemsRepository } from '../../src/store/repositories/drive-items';
import { DriveMissingRepository } from '../../src/store/repositories/drive-missing';
import { DriveRootsRepository } from '../../src/store/repositories/drive-roots';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';
import { bundleWorker } from './drive-fixture';

const NOW = '2026-11-17T00:00:00.000Z';
const ROOT = '0d000000-0000-4000-8000-000000000071';

let bundleFolder = '';
let workerScript = '';
let tree = '';
let database: DatabaseSync;
let roots: DriveRootsRepository;
let items: DriveItemsRepository;
let context: StoreContext;
let feed: ChangeFeed;
let progress = 0;

beforeAll(async () => {
  bundleFolder = mkdtempSync(join(tmpdir(), 'reflect-bundle-'));
  workerScript = join(bundleFolder, 'scanner-worker.mjs');
  await bundleWorker('scanner-worker.ts', workerScript);
});

afterAll(() => {
  rmSync(bundleFolder, { recursive: true, force: true });
});

function driveRoot(): DriveRoot {
  return {
    id: ROOT,
    scope: 'home',
    ownerProfileId: null,
    versions: false,
    indexId: 'index-1',
    state: 'ready',
    stateReason: null,
    items: 0,
    folders: 0,
    bytes: 0,
    scannedAt: null,
    health: {
      hashedShare: 0,
      verifiedShare: 0,
      corrupt: 0,
      lastScrubAt: null,
      lastBackupAt: null,
    },
    skipPatterns: [],
    includeHidden: false,
  };
}

beforeEach(() => {
  tree = mkdtempSync(join(tmpdir(), 'reflect-tree-'));
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const log = testLogger();
  feed = new ChangeFeed(log);
  const sql = new Sql(database);
  context = new StoreContext(sql, feed, () => new Date(NOW));
  migrate(sql, MIGRATIONS, NOW, log);
  roots = new DriveRootsRepository(context, () => tree);
  items = new DriveItemsRepository(context);
  roots.insert(driveRoot());
  progress = 0;
  feed.subscribeNotices((notice) => {
    if (notice.type === 'drive_progress') progress += 1;
  });
});

afterEach(() => {
  database.close();
  rmSync(tree, { recursive: true, force: true });
});

function environment(): ScanEnvironment {
  return {
    store: {
      driveRoots: roots,
      driveItems: items,
      driveInodes: new DriveInodesRepository(context),
      driveMissing: new DriveMissingRepository(context),
      feed,
      write: (work) => context.write(work),
      now: () => new Date(NOW),
    },
    availability: () => Promise.resolve('online'),
    mounted: () => false,
    workerScript,
    lanes: new DriveRootLanes(),
    log: testLogger(),
  };
}

const signal = (): AbortSignal => new AbortController().signal;

async function scan(): Promise<void> {
  await scanHandler(environment())({ kind: 'scan', rootId: ROOT }, signal());
}

async function reflect(paths: readonly string[]): Promise<void> {
  await reflectHandler(environment())({ kind: 'reflect', rootId: ROOT, paths }, signal());
}

function write(relPath: string, text: string): void {
  writeFileSync(join(tree, relPath), text);
}

function indexed(): string[] {
  return items
    .children({ rootId: ROOT, parentId: null, after: null, limit: 1000, viewer: null })
    .entries.flatMap((entry) =>
      entry.item.kind === 'folder'
        ? [
            entry.item.relPath,
            ...items
              .children({
                rootId: ROOT,
                parentId: entry.item.id,
                after: null,
                limit: 1000,
                viewer: null,
              })
              .entries.map((child) => child.item.relPath),
          ]
        : [entry.item.relPath],
    )
    .sort();
}

describe('reflecting the changed paths of a drive', () => {
  it('indexes a new file and touches nothing outside the named paths', async () => {
    mkdirSync(join(tree, 'Photos'));
    write('Photos/a.jpg', 'a');
    write('notes.txt', 'n');
    await scan();
    const before = roots.byId(ROOT);
    write('Photos/b.jpg', 'b');
    rmSync(join(tree, 'notes.txt'));
    await reflect(['Photos/b.jpg']);
    expect(indexed()).toEqual(['Photos', 'Photos/a.jpg', 'Photos/b.jpg', 'notes.txt']);
    expect(items.byPath(ROOT, 'Photos/b.jpg', null)).toMatchObject({ outside: true });
    expect(roots.byId(ROOT)).toMatchObject({ state: before.state, items: before.items + 1 });
  });

  it('drops a file that is gone and walks a new folder whole', async () => {
    mkdirSync(join(tree, 'Photos'));
    write('Photos/a.jpg', 'a');
    await scan();
    rmSync(join(tree, 'Photos/a.jpg'));
    mkdirSync(join(tree, 'Trips/2026'), { recursive: true });
    write('Trips/2026/c.jpg', 'c');
    await reflect(['Photos/a.jpg', 'Trips/2026/c.jpg']);
    expect(indexed()).toEqual(['Photos', 'Trips', 'Trips/2026']);
    expect(items.byPath(ROOT, 'Trips/2026/c.jpg', null)).toBeDefined();
    expect(items.byPath(ROOT, 'Photos/a.jpg', null)).toBeUndefined();
  });

  it('keeps the identity of a file moved between two named paths', async () => {
    mkdirSync(join(tree, 'Inbox'));
    mkdirSync(join(tree, 'Photos'));
    write('Inbox/a.jpg', 'a');
    await scan();
    const id = items.byPath(ROOT, 'Inbox/a.jpg', null)?.id;
    renameSync(join(tree, 'Inbox/a.jpg'), join(tree, 'Photos/a.jpg'));
    await reflect(['Photos/a.jpg', 'Inbox/a.jpg']);
    expect(items.byPath(ROOT, 'Photos/a.jpg', null)?.id).toBe(id);
    expect(items.byPath(ROOT, 'Inbox/a.jpg', null)).toBeUndefined();
  });

  it('announces no scan progress for a reflected path', async () => {
    write('a.txt', 'a');
    await scan();
    progress = 0;
    write('b.txt', 'b');
    await reflect(['b.txt']);
    expect(progress).toBe(0);
    expect(items.byPath(ROOT, 'b.txt', null)).toBeDefined();
  });

  it('lifts a path to its first folder the index does not hold and drops nested paths', () => {
    mkdirSync(join(tree, 'Photos'));
    expect(scopesOf(items, ROOT, ['New/deep/a.jpg', 'New/b.jpg', 'top.txt'])).toEqual([
      'New',
      'top.txt',
    ]);
  });

  it('merges the paths of reflect jobs waiting for the same drive', () => {
    expect(
      mergeJobs(
        { kind: 'reflect', rootId: ROOT, paths: ['a', 'b'] },
        { kind: 'reflect', rootId: ROOT, paths: ['b', 'c'] },
      ),
    ).toEqual({ kind: 'reflect', rootId: ROOT, paths: ['a', 'b', 'c'] });
  });
});
