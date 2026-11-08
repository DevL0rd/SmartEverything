import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  watch,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { scanHandler, type ScanEnvironment } from '../../src/drive/jobs';
import {
  DriveWatchers,
  systemWatch,
  type WatchEnvironment,
  type WatchFactory,
} from '../../src/drive/watcher';
import { WorkQueue } from '../../src/drive/work-queue';
import { testLogger } from '../support/logs';
import {
  bundleWorker,
  folderRoot,
  NOW,
  openDriveFixture,
  type DriveFixture,
} from './drive-fixture';

const ROOT = '0d000000-0000-4000-8000-000000000003';
const SETTLE_MS = 40;

let base = '';
let fixture: DriveFixture;
let roots: DriveFixture['roots'];
let items: DriveFixture['items'];
let context: DriveFixture['context'];
let scans: string[];
let watchers: DriveWatchers | undefined;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'watcher-'));
  fixture = openDriveFixture();
  ({ roots, items, context } = fixture);
  scans = [];
  watchers = undefined;
});

afterEach(() => {
  watchers?.close();
  fixture.database.close();
  rmSync(base, { recursive: true, force: true });
});

function nextScan(): Promise<void> {
  const seen = scans.length;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      clearInterval(poll);
      reject(new Error('no scan was requested'));
    }, 5000);
    const poll = setInterval(() => {
      if (scans.length > seen) {
        clearTimeout(timer);
        clearInterval(poll);
        resolve();
      }
    }, 5);
  });
}

const pause = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function watchersOver(
  folder: string,
  factory: WatchFactory = systemWatch,
  enqueue: (rootId: string) => void = (rootId) => scans.push(rootId),
  skipPatterns: readonly string[] = [],
): DriveWatchers {
  roots.insert(folderRoot(ROOT, folder, { skipPatterns }));
  const environment: WatchEnvironment = {
    roots,
    enqueueScan: enqueue,
    watch: factory,
    settleMs: SETTLE_MS,
    log: testLogger(),
  };
  watchers = new DriveWatchers(environment);
  return watchers;
}

const lockedTree = (root: string): string => {
  const locked = join(root, 'ok/locked');
  mkdirSync(join(locked, 'inner'), { recursive: true });
  mkdirSync(join(root, 'ok/open/deeper'), { recursive: true });
  mkdirSync(join(root, 'other/deeper'), { recursive: true });
  chmodSync(locked, 0);
  return locked;
};

describe('what the watcher relies on from fs.watch on Linux', () => {
  it('throws EACCES naming the directory when any subdirectory is unreadable', () => {
    if (process.getuid?.() === 0) return;
    const locked = lockedTree(join(base, 'locked'));
    try {
      expect(() => watch(join(base, 'locked'), { recursive: true })).toThrow(
        expect.objectContaining({ code: 'EACCES', path: locked }),
      );
    } finally {
      chmodSync(locked, 0o755);
    }
  });

  it('never reports a queue overflow, so only a re-read after the burst knows every name', async () => {
    const root = join(base, 'burst');
    mkdirSync(root);
    const names = new Set<string>();
    const errors: Error[] = [];
    const watcher = watch(root, { recursive: true }, (_type, name) => {
      names.add(String(name));
    });
    watcher.on('error', (error) => errors.push(error));
    const created = 30000;
    for (let index = 0; index < created; index += 1)
      writeFileSync(join(root, `f${String(index)}`), '');
    await pause(200);
    watcher.close();
    expect(errors).toEqual([]);
    expect(readdirSync(root).length).toBe(created);
    expect(names.size).toBeLessThanOrEqual(created);
  });

  it('holds one inotify watch per directory for ten thousand directories', () => {
    const root = join(base, 'big');
    mkdirSync(root);
    const queue = [root];
    for (let made = 0; made < 10000;) {
      const parent = queue.shift() ?? root;
      for (let index = 0; index < 20 && made < 10000; index += 1, made += 1) {
        const child = join(parent, `d${String(index)}`);
        mkdirSync(child);
        queue.push(child);
      }
    }
    const count = (): number =>
      readdirSync('/proc/self/fdinfo').reduce((total, fd) => {
        try {
          return (
            total +
            readFileSync(`/proc/self/fdinfo/${fd}`, 'utf8')
              .split('\n')
              .filter((line) => line.startsWith('inotify wd:')).length
          );
        } catch (cause) {
          expect(cause).toBeInstanceOf(Error);
          return total;
        }
      }, 0);
    const before = count();
    const started = performance.now();
    const watcher = watch(root, { recursive: true });
    expect(performance.now() - started).toBeLessThan(2000);
    expect(count() - before).toBeGreaterThanOrEqual(10000);
    watcher.close();
  });
});

describe('the root watcher', () => {
  it('asks for a reconcile on start, then once per burst of changes five levels deep', async () => {
    const deepest = join(base, 'a/b/c/d/e');
    mkdirSync(deepest, { recursive: true });
    const pool = watchersOver(base);
    pool.start(roots.byId(ROOT));
    expect(scans).toEqual([ROOT]);
    writeFileSync(join(deepest, 'one.txt'), '1');
    writeFileSync(join(deepest, 'two.txt'), '2');
    renameSync(join(deepest, 'two.txt'), join(deepest, 'three.txt'));
    await nextScan();
    await pause(SETTLE_MS * 3);
    expect(scans).toEqual([ROOT, ROOT]);
  });

  it('keeps watching a subtree made by one mkdir -p and a populated folder moved in', async () => {
    mkdirSync(join(base, 'outside/a/b'), { recursive: true });
    const root = join(base, 'root');
    mkdirSync(root);
    const pool = watchersOver(root);
    pool.start(roots.byId(ROOT));
    mkdirSync(join(root, 'n1/n2/n3'), { recursive: true });
    await nextScan();
    writeFileSync(join(root, 'n1/n2/n3/late.txt'), 'y');
    await nextScan();
    renameSync(join(base, 'outside'), join(root, 'moved'));
    await nextScan();
    writeFileSync(join(root, 'moved/a/b/inside.txt'), 'z');
    await nextScan();
    expect(scans.length).toBe(5);
  });

  it('ignores the hidden control folder, hidden names and skipped patterns', async () => {
    const root = join(base, 'ignored');
    mkdirSync(join(root, '.smarteverything/tmp'), { recursive: true });
    mkdirSync(join(root, 'cache'));
    const pool = watchersOver(root, systemWatch, (rootId) => scans.push(rootId), ['cache/**']);
    pool.start(roots.byId(ROOT));
    writeFileSync(join(root, '.smarteverything/tmp/x'), '1');
    writeFileSync(join(root, '.hidden'), '1');
    writeFileSync(join(root, 'cache/y'), '1');
    await pause(SETTLE_MS * 4);
    expect(scans).toEqual([ROOT]);
    writeFileSync(join(root, 'real.txt'), '1');
    await nextScan();
  });

  it('splits the tree around an unreadable directory and still hears every readable part', async () => {
    if (process.getuid?.() === 0) return;
    const root = join(base, 'split');
    const locked = lockedTree(root);
    try {
      const pool = watchersOver(root);
      pool.start(roots.byId(ROOT));
      expect(pool.status(ROOT)).toEqual({ watching: true, unreadable: [locked], problem: null });
      writeFileSync(join(root, 'ok/open/deeper/a.txt'), '1');
      await nextScan();
      writeFileSync(join(root, 'other/deeper/b.txt'), '1');
      await nextScan();
      expect(scans.length).toBe(3);
    } finally {
      chmodSync(locked, 0o755);
    }
  });

  it('attaches a directory created under a split watch when its rename event arrives', async () => {
    if (process.getuid?.() === 0) return;
    const root = join(base, 'attach');
    const locked = lockedTree(root);
    try {
      const pool = watchersOver(root);
      pool.start(roots.byId(ROOT));
      mkdirSync(join(root, 'ok/fresh/inner'), { recursive: true });
      await nextScan();
      writeFileSync(join(root, 'ok/fresh/inner/late.txt'), '1');
      await nextScan();
      expect(scans.length).toBe(3);
    } finally {
      chmodSync(locked, 0o755);
    }
  });

  it('shows an exhausted watch limit on the root and stops adding watches', () => {
    mkdirSync(join(base, 'a'));
    let attempts = 0;
    const refusing: WatchFactory = (directory) => {
      attempts += 1;
      throw Object.assign(new Error('limit'), { code: 'ENOSPC', path: directory });
    };
    const pool = watchersOver(base, refusing);
    pool.start(roots.byId(ROOT));
    const status = pool.status(ROOT);
    expect(status.watching).toBe(false);
    expect(status.problem).toMatch(/limit on watched folders/);
    expect(roots.byId(ROOT).stateReason).toBe(status.problem);
    expect(attempts).toBe(1);
    expect(scans).toEqual([ROOT]);
  });

  it('closes on a watch error, shows it, asks for one reconcile and does not restart', () => {
    let fail: (cause: Error) => void = () => undefined;
    let closed = 0;
    const factory: WatchFactory = () => ({
      close: (): void => {
        closed += 1;
      },
      onError: (listener): void => {
        fail = listener;
      },
    });
    const pool = watchersOver(base, factory);
    pool.start(roots.byId(ROOT));
    fail(Object.assign(new Error('boom'), { code: 'EIO' }));
    expect(closed).toBe(1);
    expect(scans).toEqual([ROOT, ROOT]);
    expect(pool.status(ROOT)).toMatchObject({ watching: false });
    expect(roots.byId(ROOT).stateReason).toMatch(/\(EIO\)/);
  });

  it('starts again with a reconcile after a remount, and clears a shown problem', () => {
    let refuse = true;
    const factory: WatchFactory = (directory, recursive, onEvent) => {
      if (refuse) throw Object.assign(new Error('limit'), { code: 'ENOSPC' });
      return systemWatch(directory, recursive, onEvent);
    };
    const pool = watchersOver(base, factory);
    pool.start(roots.byId(ROOT));
    expect(roots.byId(ROOT).stateReason).not.toBeNull();
    refuse = false;
    pool.remounted(ROOT);
    expect(scans).toEqual([ROOT, ROOT]);
    expect(pool.status(ROOT)).toMatchObject({ watching: true, problem: null });
    expect(roots.byId(ROOT).stateReason).toBeNull();
  });

  it('reconciles when the root is opened or rescanned, and reports nothing for an unwatched root', () => {
    const pool = watchersOver(base);
    pool.reconcile(ROOT);
    expect(scans).toEqual([ROOT]);
    expect(pool.status(ROOT)).toEqual({ watching: false, unreadable: [], problem: null });
  });
});

describe('a hub write seen again by the watcher', () => {
  let bundleFolder = '';
  let workerScript = '';

  beforeAll(async () => {
    bundleFolder = mkdtempSync(join(tmpdir(), 'watcher-bundle-'));
    workerScript = join(bundleFolder, 'scanner-worker.mjs');
    await bundleWorker('scanner-worker.ts', workerScript);
  });

  afterAll(() => {
    rmSync(bundleFolder, { recursive: true, force: true });
  });

  it('produces no second rev when the stored post-rename stat matches', async () => {
    const environment: ScanEnvironment = {
      store: {
        driveRoots: roots,
        driveItems: items,
        feed: fixture.feed,
        write: (work) => context.write(work),
        now: () => new Date(NOW),
      },
      availability: () => Promise.resolve('online'),
      workerScript,
      log: testLogger(),
    };
    const queue = new WorkQueue<string>({
      concurrency: 1,
      keyOf: (rootId): string => rootId,
      run: (rootId, signal): Promise<void> =>
        scanHandler(environment)({ kind: 'scan', rootId }, signal),
      failed: (_rootId, cause): never => {
        throw cause;
      },
    });
    const pool = watchersOver(base, systemWatch, (rootId) => {
      scans.push(rootId);
      queue.enqueue(rootId);
    });
    pool.start(roots.byId(ROOT));
    await queue.idle();
    const file = join(base, 'doc.txt');
    writeFileSync(file, 'hello');
    const stats = statSync(file, { bigint: true });
    const id = randomUUID();
    items.write({
      identity: { dev: stats.dev.toString(), ino: stats.ino.toString() },
      item: {
        id,
        rootId: ROOT,
        parentId: null,
        relPath: 'doc.txt',
        name: 'doc.txt',
        kind: 'document',
        mime: 'text/plain',
        bytes: 5,
        sha256: null,
        integrity: 'unknown',
        thumb: { state: 'none' },
        modifiedAt: new Date(Number(stats.mtimeMs)).toISOString(),
        addedAt: NOW,
        starred: false,
        outside: false,
        addedByProfileId: null,
        remoteId: null,
        remoteRev: null,
      },
    });
    await nextScan();
    await queue.idle();
    expect(items.byPath(ROOT, 'doc.txt')).toMatchObject({ id, rev: 1, outside: false });
    writeFileSync(file, 'hello world');
    await nextScan();
    await queue.idle();
    expect(items.byPath(ROOT, 'doc.txt')).toMatchObject({ id, rev: 2, bytes: 11 });
  });
});
