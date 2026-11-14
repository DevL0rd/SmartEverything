import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DriveRoot } from '@smarteverything/domain';
import { build } from 'esbuild';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { classify, ScanCommitter, type CommitDependencies } from '../../src/drive/scanner-commit';
import {
  jobKey,
  runnerOf,
  scanHandler,
  watchHang,
  type DriveJob,
  type ScanEnvironment,
} from '../../src/drive/jobs';
import {
  CallClock,
  CONTROL_CALL,
  CONTROL_SLOTS,
  UNRESPONSIVE_AFTER_MS,
} from '../../src/drive/scanner-walk';
import { defaultConcurrency, WorkQueue } from '../../src/drive/work-queue';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { DriveItemsRepository } from '../../src/store/repositories/drive-items';
import { DriveRootsRepository } from '../../src/store/repositories/drive-roots';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const NOW = '2026-11-07T00:00:00.000Z';
const ROOT = '0d000000-0000-4000-8000-000000000001';
const HEALTH = {
  hashedShare: 0,
  verifiedShare: 0,
  corrupt: 0,
  lastScrubAt: null,
  lastBackupAt: null,
} as const;

let bundleFolder = '';
let workerScript = '';
let tree = '';
let database: DatabaseSync;
let roots: DriveRootsRepository;
let items: DriveItemsRepository;
let feed: ChangeFeed;
let context: StoreContext;
let notices: { readonly done: number; readonly total: number }[];
let availability: 'online' | 'missing' | 'different';

beforeAll(async () => {
  bundleFolder = mkdtempSync(join(tmpdir(), 'scanner-bundle-'));
  workerScript = join(bundleFolder, 'scanner-worker.mjs');
  await build({
    entryPoints: [fileURLToPath(new URL('../../src/drive/scanner-worker.ts', import.meta.url))],
    outfile: workerScript,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    logLevel: 'silent',
  });
});

afterAll(() => {
  rmSync(bundleFolder, { recursive: true, force: true });
});

function driveRoot(fields: Partial<DriveRoot> = {}): DriveRoot {
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
    health: HEALTH,
    skipPatterns: [],
    includeHidden: false,
    ...fields,
  };
}

beforeEach(() => {
  tree = mkdtempSync(join(tmpdir(), 'scanner-tree-'));
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const log = testLogger();
  feed = new ChangeFeed(log);
  const sql = new Sql(database);
  context = new StoreContext(sql, feed, () => new Date(NOW));
  migrate(sql, MIGRATIONS, NOW, log);
  roots = new DriveRootsRepository(context, () => tree);
  items = new DriveItemsRepository(context);
  notices = [];
  feed.subscribeNotices((notice) => {
    if (notice.type === 'drive_progress') {
      notices.push({ done: notice.done, total: notice.total });
    }
  });
  availability = 'online';
  roots.insert(driveRoot());
});

afterEach(() => {
  database.close();
  rmSync(tree, { recursive: true, force: true });
});

function environment(script = workerScript): ScanEnvironment {
  return {
    store: {
      driveRoots: roots,
      driveItems: items,
      feed,
      write: (work) => context.write(work),
      now: () => new Date(NOW),
    },
    availability: () => Promise.resolve(availability),
    workerScript: script,
    log: testLogger(),
  };
}

async function scan(script = workerScript): Promise<void> {
  const signal = new AbortController().signal;
  await scanHandler(environment(script))({ kind: 'scan', rootId: ROOT }, signal);
}

function put(path: string, text = 'x'): void {
  const full = join(tree, path);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, text);
}

function pathsInIndex(): string[] {
  return database
    .prepare('select rel_path from drive_items where root_id = ? order by rel_path')
    .all(ROOT)
    .map((row) => String(row['rel_path']));
}

describe('scanning a root', () => {
  it('indexes folders and files with kinds, parents, counts and the root totals', async () => {
    put('photos/a.jpg', '12345');
    put('photos/trip/b.mp4', '123');
    put('notes/c.txt', 'hello');
    put('d.bin', '12');
    await scan();
    expect(pathsInIndex()).toEqual([
      'd.bin',
      'notes',
      'notes/c.txt',
      'photos',
      'photos/a.jpg',
      'photos/trip',
      'photos/trip/b.mp4',
    ]);
    const photos = items.byPath(ROOT, 'photos', null);
    const jpg = items.byPath(ROOT, 'photos/a.jpg', null);
    expect(photos).toMatchObject({ kind: 'folder', childCount: 2, bytes: 5, parentId: null });
    expect(jpg).toMatchObject({
      kind: 'image',
      mime: 'image/jpeg',
      parentId: photos?.id,
      rev: 1,
      outside: false,
      addedByProfileId: null,
    });
    expect(items.byPath(ROOT, 'photos/trip/b.mp4', null)).toMatchObject({ kind: 'video' });
    expect(items.byPath(ROOT, 'notes/c.txt', null)).toMatchObject({ kind: 'document' });
    expect(items.byPath(ROOT, 'd.bin', null)).toMatchObject({ kind: 'other' });
    expect(roots.byId(ROOT)).toMatchObject({
      state: 'ready',
      stateReason: null,
      items: 4,
      folders: 3,
      bytes: 15,
      scannedAt: NOW,
    });
    expect(notices.at(-1)).toEqual({ done: 7, total: 7 });
  });

  it('batches large directories and keeps every entry', async () => {
    for (let index = 0; index < 2500; index += 1) put(`big/file-${String(index)}.txt`, 'x');
    await scan();
    expect(roots.byId(ROOT)).toMatchObject({ items: 2500, folders: 1 });
    expect(items.byPath(ROOT, 'big', null)).toMatchObject({ childCount: 2500, bytes: 2500 });
    expect(notices.length).toBeGreaterThan(2);
    expect(notices.every((notice) => notice.done <= notice.total)).toBe(true);
  });

  it('leaves unchanged items alone on a second scan', async () => {
    put('a/one.txt');
    await scan();
    const before = items.byPath(ROOT, 'a/one.txt', null);
    await scan();
    expect(items.byPath(ROOT, 'a/one.txt', null)).toEqual(before);
    expect(items.byPath(ROOT, 'a', null)?.rev).toBe(1);
  });

  it('bumps the rev when content changes and marks it as changed outside', async () => {
    put('a.txt', 'one');
    await scan();
    const first = items.byPath(ROOT, 'a.txt', null);
    put('a.txt', 'longer text');
    utimesSync(join(tree, 'a.txt'), 1_800_000_000, 1_800_000_000);
    await scan();
    const second = items.byPath(ROOT, 'a.txt', null);
    expect(second).toMatchObject({ id: first?.id, rev: 2, bytes: 11, outside: true });
    expect(second?.etag).not.toBe(first?.etag);
  });

  it('keeps the item id when a file or a folder with contents is renamed', async () => {
    put('old/inner.txt', 'inner');
    put('keep.txt', 'keep');
    await scan();
    const folder = items.byPath(ROOT, 'old', null);
    const inner = items.byPath(ROOT, 'old/inner.txt', null);
    const kept = items.byPath(ROOT, 'keep.txt', null);
    renameSync(join(tree, 'old'), join(tree, 'new'));
    renameSync(join(tree, 'keep.txt'), join(tree, 'renamed.txt'));
    await scan();
    expect(pathsInIndex()).toEqual(['new', 'new/inner.txt', 'renamed.txt']);
    expect(items.byPath(ROOT, 'new', null)?.id).toBe(folder?.id);
    expect(items.byPath(ROOT, 'new/inner.txt', null)).toMatchObject({
      id: inner?.id,
      parentId: folder?.id,
      outside: true,
    });
    expect(items.byPath(ROOT, 'renamed.txt', null)?.id).toBe(kept?.id);
  });

  it('keeps the id of a file replaced in place by a new inode', async () => {
    put('doc.txt', 'first');
    await scan();
    const first = items.byPath(ROOT, 'doc.txt', null);
    rmSync(join(tree, 'doc.txt'));
    put('doc.txt', 'second version');
    await scan();
    expect(items.byPath(ROOT, 'doc.txt', null)).toMatchObject({ id: first?.id, rev: 2, bytes: 14 });
  });

  it('survives renaming a file while another file takes its old name', async () => {
    put('x', 'moved content');
    await scan();
    const moved = items.byPath(ROOT, 'x', null);
    renameSync(join(tree, 'x'), join(tree, 'y'));
    put('x', 'a brand new file');
    await scan();
    expect(pathsInIndex()).toEqual(['x', 'y']);
    expect(items.byPath(ROOT, 'y', null)?.id).toBe(moved?.id);
    expect(items.byPath(ROOT, 'x', null)?.id).not.toBe(moved?.id);
  });

  it('removes what disappeared, folders with their contents', async () => {
    put('gone/a.txt');
    put('gone/deep/b.txt');
    put('stay.txt');
    await scan();
    rmSync(join(tree, 'gone'), { recursive: true });
    await scan();
    expect(pathsInIndex()).toEqual(['stay.txt']);
    expect(roots.byId(ROOT)).toMatchObject({ items: 1, folders: 0 });
  });

  it('keeps the index below a folder it could not read', async () => {
    if (process.getuid?.() === 0) return;
    put('locked/a.txt');
    put('open/b.txt');
    await scan();
    chmodSync(join(tree, 'locked'), 0o000);
    try {
      await scan();
      expect(pathsInIndex()).toContain('locked/a.txt');
      expect(roots.byId(ROOT)).toMatchObject({ state: 'ready', items: 2 });
    } finally {
      chmodSync(join(tree, 'locked'), 0o755);
    }
  });

  it('skips hidden files, the marker folder, skip patterns and links', async () => {
    roots.update(ROOT, { skipPatterns: ['*.tmp', 'cache/**'] });
    put('.hidden');
    put('.smarteverything/root.json');
    put('a.tmp');
    put('cache/x/y.txt');
    put('visible.txt');
    symlinkSync(join(tree, 'visible.txt'), join(tree, 'link.txt'));
    await scan();
    expect(pathsInIndex()).toEqual(['cache', 'visible.txt']);
  });

  it('indexes hidden files when the root asks for them', async () => {
    roots.update(ROOT, { includeHidden: true });
    put('.hidden');
    put('.smarteverything/root.json');
    await scan();
    expect(pathsInIndex()).toEqual(['.hidden']);
  });

  it('marks a drive whose folder is not its own as an error with the index kept', async () => {
    put('a.txt');
    await scan();
    availability = 'different';
    await scan(join(bundleFolder, 'not-spawned.mjs'));
    expect(roots.byId(ROOT)).toMatchObject({ state: 'error', items: 1 });
    expect(roots.byId(ROOT).stateReason).toBe(
      'The folder is not this drive; its identity marker does not match.',
    );
  });

  it('reports a failed walk on the root and keeps the index', async () => {
    put('a.txt');
    await scan();
    rmSync(tree, { recursive: true, force: true });
    await scan();
    expect(roots.byId(ROOT).state).toBe('error');
    expect(pathsInIndex()).toEqual(['a.txt']);
  });

  it('stops without touching the index when cancelled', async () => {
    put('a.txt');
    await scan();
    put('b.txt');
    const controller = new AbortController();
    controller.abort();
    await scanHandler(environment())({ kind: 'scan', rootId: ROOT }, controller.signal);
    expect(pathsInIndex()).toEqual(['a.txt']);
  });
});

describe('classification', () => {
  it('maps extensions to kinds and falls back to octet-stream', () => {
    expect(classify('x.png').kind).toBe('image');
    expect(classify('x.mkv').kind).toBe('video');
    expect(classify('x.flac').kind).toBe('audio');
    expect(classify('x.pdf').kind).toBe('document');
    expect(classify('x.docx').kind).toBe('document');
    expect(classify('x.zip').kind).toBe('other');
    expect(classify('noextension')).toEqual({ mime: 'application/octet-stream', kind: 'other' });
  });
});

describe('the unresponsive watch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports a call that stays open past the threshold and clears when it returns', () => {
    const control = new Int32Array(new SharedArrayBuffer(CONTROL_SLOTS * 4));
    const origin = Date.now() - 10_000;
    const changes: boolean[] = [];
    const stop = watchHang(control, origin, (stuck) => {
      changes.push(stuck);
    });
    Atomics.store(control, CONTROL_CALL, 1);
    vi.advanceTimersByTime(UNRESPONSIVE_AFTER_MS);
    expect(changes).toEqual([true]);
    vi.advanceTimersByTime(UNRESPONSIVE_AFTER_MS);
    expect(changes).toEqual([true]);
    Atomics.store(control, CONTROL_CALL, 0);
    vi.advanceTimersByTime(UNRESPONSIVE_AFTER_MS);
    expect(changes).toEqual([true, false]);
    stop();
    Atomics.store(control, CONTROL_CALL, 1);
    vi.advanceTimersByTime(UNRESPONSIVE_AFTER_MS * 3);
    expect(changes).toEqual([true, false]);
  });

  it('measures only the open call', () => {
    const control = new Int32Array(new SharedArrayBuffer(CONTROL_SLOTS * 4));
    const origin = Date.now();
    const clock = new CallClock(control, origin);
    vi.advanceTimersByTime(5000);
    expect(CallClock.stuckForMs(control, origin)).toBe(0);
    const during = clock.around(() => CallClock.stuckForMs(control, origin));
    expect(during).toBeGreaterThanOrEqual(0);
    expect(CallClock.stuckForMs(control, origin)).toBe(0);
  });
});

describe('the 100k index', () => {
  const FOLDERS = 1000;
  const FILES = 99_000;

  function fill(): void {
    database.exec(`
      insert into drive_items (id, root_id, parent_id, rel_path, name, kind, mime, bytes, child_count, sha256, integrity, dev, ino, modified_at, added_at, rev, etag, outside, thumb_state)
      with recursive n(i) as (select 0 union all select i + 1 from n where i < ${String(FOLDERS - 1)})
      select '0e000000-0000-4000-8000-' || printf('%012d', i), '${ROOT}', null, 'd' || i, 'd' || i, 'folder', null, 0, 99, null, 'unknown', '1', 'f' || i, '${NOW}', '${NOW}', 1, '1-0.0', 0, 'none' from n`);
    database.exec(`
      insert into drive_items (id, root_id, parent_id, rel_path, name, kind, mime, bytes, child_count, sha256, integrity, dev, ino, modified_at, added_at, rev, etag, outside, thumb_state)
      with recursive n(i) as (select 0 union all select i + 1 from n where i < ${String(FILES - 1)})
      select '0d000000-0000-4000-8000-' || printf('%012d', i + 100), '${ROOT}', '0e000000-0000-4000-8000-' || printf('%012d', i % ${String(FOLDERS)}), 'd' || (i % ${String(FOLDERS)}) || '/n' || i, 'n' || i, 'document', 'text/plain', 1, null, null, 'unknown', '1', 'i' || i, '${NOW}', '${NOW}', 1, '1-0.0', 0, 'none' from n`);
  }

  function plan(text: string, parameters: Record<string, string>): string {
    return database
      .prepare(`explain query plan ${text}`)
      .all(parameters)
      .map((row) => String(row['detail']))
      .join(' | ');
  }

  it('answers the scanner lookups from indexes', () => {
    fill();
    const children = plan(
      'select id from drive_items where root_id = $rootId and parent_id is $parentId and name > $after order by name limit 1000',
      { rootId: ROOT, parentId: '0e000000-0000-4000-8000-000000000001', after: 'a' },
    );
    const byPath = plan(
      'select id from drive_items where root_id = $rootId and rel_path = $relPath',
      {
        rootId: ROOT,
        relPath: 'd1/n1',
      },
    );
    expect(children).toContain('drive_items_by_parent');
    expect(children).not.toMatch(/SCAN drive_items/u);
    expect(byPath).toMatch(/SEARCH drive_items USING (COVERING )?INDEX/u);
  });

  it('loads the whole index folder by folder for a rescan', () => {
    fill();
    const dependencies: CommitDependencies = {
      items,
      write: (work) => context.write(work),
      now: () => new Date(NOW),
      newId: randomUUID,
    };
    const committer = new ScanCommitter(dependencies, roots.byId(ROOT));
    expect(committer.previous).toBe(FOLDERS + FILES);
  });
});

describe('the work queue', () => {
  interface Job {
    readonly key: string;
    readonly label: string;
  }

  function gate(): { readonly open: () => void; readonly wait: Promise<void> } {
    let open: () => void = () => undefined;
    const wait = new Promise<void>((resolve) => {
      open = resolve;
    });
    return { open, wait };
  }

  it('sizes itself from the available parallelism', () => {
    expect(defaultConcurrency()).toBeGreaterThanOrEqual(1);
  });

  it('runs at most the concurrency at once and drains everything', async () => {
    const gates = [gate(), gate(), gate(), gate()];
    let active = 0;
    let peak = 0;
    const order: string[] = [];
    const queue = new WorkQueue<Job>({
      concurrency: 2,
      keyOf: (job): string => job.key,
      run: async (job): Promise<void> => {
        active += 1;
        peak = Math.max(peak, active);
        order.push(job.key);
        await gates[Number(job.key)]?.wait;
        active -= 1;
      },
      failed: (): void => undefined,
    });
    for (const key of ['0', '1', '2', '3']) queue.enqueue({ key, label: key });
    expect(order).toEqual(['0', '1']);
    gates[0]?.open();
    await vi.waitFor(() => {
      expect(order).toEqual(['0', '1', '2']);
    });
    gates.forEach((entry) => {
      entry.open();
    });
    await queue.idle();
    expect(order).toEqual(['0', '1', '2', '3']);
    expect(peak).toBe(2);
  });

  it('collapses a queued duplicate and reruns a job enqueued while it runs', async () => {
    const first = gate();
    const seen: string[] = [];
    const queue = new WorkQueue<Job>({
      concurrency: 1,
      keyOf: (job): string => job.key,
      run: async (job): Promise<void> => {
        seen.push(job.label);
        if (job.label === 'first') await first.wait;
      },
      failed: (): void => undefined,
    });
    queue.enqueue({ key: 'a', label: 'first' });
    queue.enqueue({ key: 'a', label: 'during' });
    queue.enqueue({ key: 'a', label: 'latest' });
    queue.enqueue({ key: 'b', label: 'other' });
    queue.enqueue({ key: 'b', label: 'other again' });
    first.open();
    await queue.idle();
    expect(seen).toEqual(['first', 'other again', 'latest']);
  });

  it('reports a failure and keeps working', async () => {
    const failures: string[] = [];
    const ran: string[] = [];
    const queue = new WorkQueue<Job>({
      concurrency: 1,
      keyOf: (job): string => job.key,
      run: (job): Promise<void> => {
        ran.push(job.key);
        return job.key === 'bad' ? Promise.reject(new Error('boom')) : Promise.resolve();
      },
      failed: (job, cause): void => {
        failures.push(`${job.key}:${cause instanceof Error ? cause.message : ''}`);
      },
    });
    queue.enqueue({ key: 'bad', label: '' });
    queue.enqueue({ key: 'good', label: '' });
    await queue.idle();
    expect(failures).toEqual(['bad:boom']);
    expect(ran).toEqual(['bad', 'good']);
  });

  it('aborts running work and drops the rest when stopped', async () => {
    const aborted: boolean[] = [];
    const queue = new WorkQueue<Job>({
      concurrency: 1,
      keyOf: (job): string => job.key,
      run: (_job, signal): Promise<void> =>
        new Promise((resolve) => {
          signal.addEventListener('abort', () => {
            aborted.push(true);
            resolve();
          });
        }),
      failed: (): void => undefined,
    });
    queue.enqueue({ key: 'a', label: '' });
    queue.enqueue({ key: 'b', label: '' });
    await queue.stop();
    expect(aborted).toEqual([true]);
    queue.enqueue({ key: 'c', label: '' });
    await queue.idle();
    expect(aborted).toEqual([true]);
  });
});

describe('the job table', () => {
  it('keys jobs by kind and root and routes them to their handler', async () => {
    const job: DriveJob = { kind: 'scan', rootId: ROOT };
    expect(jobKey(job)).toBe(`scan:${ROOT}`);
    const handled: string[] = [];
    const run = runnerOf({
      scan: (scanJob) => {
        handled.push(scanJob.rootId);
        return Promise.resolve();
      },
      hash: () => Promise.resolve(),
      metadata: () => Promise.resolve(),
    });
    await run(job, new AbortController().signal);
    expect(handled).toEqual([ROOT]);
  });
});
