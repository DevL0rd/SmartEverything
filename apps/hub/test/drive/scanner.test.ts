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
import { createHash, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DriveItem, DriveRoot } from '@smarteverything/domain';
import { build } from 'esbuild';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { classify } from '../../src/drive/file-type';
import { ScanCommitter, type CommitDependencies } from '../../src/drive/scanner-commit';
import {
  jobKey,
  runnerOf,
  scanHandler,
  watchHang,
  type DriveJob,
  type ScanEnvironment,
} from '../../src/drive/jobs';
import { DriveRootLanes } from '../../src/drive/root-lanes';
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
import { DriveInodesRepository } from '../../src/store/repositories/drive-inodes';
import { DriveMissingRepository } from '../../src/store/repositories/drive-missing';
import { DriveItemsRepository } from '../../src/store/repositories/drive-items';
import { DriveRootsRepository } from '../../src/store/repositories/drive-roots';
import { DriveStarsRepository } from '../../src/store/repositories/drive-stars';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';
import { localScans } from './local-ports';

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
let clock = NOW;
let tree = '';
let database: DatabaseSync;
let roots: DriveRootsRepository;
let items: DriveItemsRepository;
let feed: ChangeFeed;
let context: StoreContext;
let notices: { readonly done: number; readonly total: number }[];
let mountedRoot = false;
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
  roots = new DriveRootsRepository(context, {
    home: tree,
    people: { parent: join(tree, 'people'), leaf: '' },
  });
  items = new DriveItemsRepository(context);
  notices = [];
  feed.subscribeNotices((notice) => {
    if (notice.type === 'drive_progress') {
      notices.push({ done: notice.done, total: notice.total });
    }
  });
  availability = 'online';
  mountedRoot = false;
  clock = NOW;
  roots.insert(driveRoot());
});

afterEach(() => {
  database.close();
  rmSync(tree, { recursive: true, force: true });
});

function environment(script = workerScript): ScanEnvironment {
  return {
    ...localScans({
      roots,
      items,
      context,
      feed,
      now: () => new Date(clock),
    }),
    availability: () => Promise.resolve(availability),
    mounted: () => Promise.resolve(mountedRoot),
    workerScript: script,
    lanes: new DriveRootLanes(),
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

  it('skips hidden files, the marker folder and skip patterns but records links', async () => {
    roots.update(ROOT, { skipPatterns: ['*.tmp', 'cache/**'] });
    put('.hidden');
    put('.smarteverything/root.json');
    put('a.tmp');
    put('cache/x/y.txt');
    put('visible.txt');
    symlinkSync(join(tree, 'visible.txt'), join(tree, 'link.txt'));
    await scan();
    expect(pathsInIndex()).toEqual(['cache', 'link.txt', 'visible.txt']);
  });

  it('indexes hidden files when the root asks for them', async () => {
    roots.update(ROOT, { includeHidden: true });
    put('.hidden');
    put('.smarteverything/root.json');
    await scan();
    expect(pathsInIndex()).toEqual(['.hidden']);
  });

  it('indexes hidden files of a drive that is mounted so files made through the mount stay', async () => {
    mountedRoot = true;
    put('.git/config');
    put('.hidden');
    put('.smarteverything/root.json');
    await scan();
    expect(pathsInIndex()).toEqual(['.git', '.git/config', '.hidden']);
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

describe('a file that went missing and came back', () => {
  let profile = '';
  let stars: DriveStarsRepository;

  const digest = (text: string): string => createHash('sha256').update(text).digest('hex');

  beforeEach(() => {
    profile = new ProfilesRepository(context).create({ name: 'Robin' }).id;
    stars = new DriveStarsRepository(context);
  });

  function at(relPath: string): DriveItem {
    const item = items.byPath(ROOT, relPath, null);
    if (item === undefined) throw new Error(`${relPath} is not indexed`);
    return item;
  }

  function hashed(relPath: string, text: string): DriveItem {
    const item = at(relPath);
    const identity = items.identityOf(item.id);
    if (identity === null || item.kind !== 'image') throw new Error(`${relPath} is not a photo`);
    return items.write({ item: { ...item, sha256: digest(text), integrity: 'ok' }, identity }).item;
  }

  function missingIds(): unknown[] {
    return database
      .prepare('select item_id from drive_missing order by rel_path')
      .all()
      .map((row) => row['item_id']);
  }

  async function lose(...paths: readonly string[]): Promise<void> {
    for (const path of paths) rmSync(join(tree, path));
    await scan();
  }

  it('keeps the id, star and hash of a photo copied elsewhere and removed in the same scan', async () => {
    put('a/one.jpg', 'alpha');
    await scan();
    const before = hashed('a/one.jpg', 'alpha');
    stars.star(profile, before.id);
    rmSync(join(tree, 'a/one.jpg'));
    put('b/one.jpg', 'alpha');
    await scan();
    const after = at('b/one.jpg');
    expect(after.id).toBe(before.id);
    expect(after).toMatchObject({ sha256: digest('alpha'), integrity: 'ok' });
    expect(stars.isStarred(profile, after.id)).toBe(true);
    expect(pathsInIndex()).not.toContain('a/one.jpg');
    expect(missingIds()).toEqual([]);
  });

  it('remembers a missing photo and gives its id and star back when it returns elsewhere', async () => {
    put('x.jpg', 'bravo');
    await scan();
    const before = hashed('x.jpg', 'bravo');
    stars.star(profile, before.id);
    await lose('x.jpg');
    expect(pathsInIndex()).toEqual([]);
    expect(missingIds()).toEqual([before.id]);
    put('back/x.jpg', 'bravo');
    await scan();
    const after = at('back/x.jpg');
    expect(after.id).toBe(before.id);
    expect(after).toMatchObject({ sha256: digest('bravo') });
    expect(stars.isStarred(profile, after.id)).toBe(true);
    expect(missingIds()).toEqual([]);
  });

  it('remembers every photo of a folder that went missing', async () => {
    put('trip/a.jpg', 'one');
    put('trip/b.jpg', 'two');
    await scan();
    const a = hashed('trip/a.jpg', 'one');
    const b = hashed('trip/b.jpg', 'two');
    rmSync(join(tree, 'trip'), { recursive: true });
    await scan();
    expect(new Set(missingIds())).toEqual(new Set([a.id, b.id]));
    put('again/b.jpg', 'two');
    await scan();
    expect(at('again/b.jpg').id).toBe(b.id);
  });

  it('gives the id to the match at the old path and makes a new item while still ambiguous', async () => {
    put('p/1.jpg', 'same');
    put('q/2.jpg', 'same');
    await scan();
    const first = hashed('p/1.jpg', 'same');
    const second = hashed('q/2.jpg', 'same');
    await lose('p/1.jpg', 'q/2.jpg');
    put('r/3.jpg', 'same');
    await scan();
    const third = at('r/3.jpg');
    expect([first.id, second.id]).not.toContain(third.id);
    put('q/2.jpg', 'same');
    await scan();
    expect(at('q/2.jpg').id).toBe(second.id);
    expect(missingIds()).toEqual([first.id]);
  });

  it('makes a new item when no missing file has the same content or path', async () => {
    put('kept.jpg', 'xxxxx');
    await scan();
    const gone = hashed('kept.jpg', 'xxxxx');
    await lose('kept.jpg');
    put('new.jpg', 'yyyyy');
    await scan();
    expect(at('new.jpg').id).not.toBe(gone.id);
    expect(at('new.jpg')).toMatchObject({ sha256: digest('yyyyy') });
    expect(missingIds()).toEqual([gone.id]);
  });

  it('keeps the id of an edited photo that comes back at its old path, as a new version', async () => {
    put('edit.jpg', 'first');
    await scan();
    const before = hashed('edit.jpg', 'first');
    stars.star(profile, before.id);
    await lose('edit.jpg');
    put('edit.jpg', 'second take');
    await scan();
    const after = at('edit.jpg');
    expect(after.id).toBe(before.id);
    expect(after.bytes).toBe(11);
    expect(after).toMatchObject({ sha256: null });
    expect(after.rev).toBeGreaterThan(before.rev);
    expect(stars.isStarred(profile, after.id)).toBe(true);
  });

  it('forgets a missing photo once its keep time has passed', async () => {
    put('old.jpg', 'charlie');
    await scan();
    const before = hashed('old.jpg', 'charlie');
    await lose('old.jpg');
    clock = '2027-11-08T00:00:00.000Z';
    put('elsewhere.jpg', 'charlie');
    await scan();
    expect(at('elsewhere.jpg').id).not.toBe(before.id);
    expect(missingIds()).toEqual([]);
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
      insert into drive_inodes (root_id, is_root, type, mode, atime_ns, mtime_ns, ctime_ns, btime_ns, orphan)
      values ('${ROOT}', 0, 'file', 420, 1, 1, 1, 1, 0)`);
    database.exec(`
      insert into drive_items (id, root_id, inode_id, parent_id, rel_path, name, kind, mime, bytes, child_count, sha256, integrity, dev, ino, modified_at, added_at, rev, etag, outside, thumb_state)
      with recursive n(i) as (select 0 union all select i + 1 from n where i < ${String(FOLDERS - 1)})
      select '0e000000-0000-4000-8000-' || printf('%012d', i), '${ROOT}', (select max(id) from drive_inodes), null, 'd' || i, 'd' || i, 'folder', null, 0, 99, null, 'unknown', '1', 'f' || i, '${NOW}', '${NOW}', 1, '1-0.0', 0, 'none' from n`);
    database.exec(`
      insert into drive_items (id, root_id, inode_id, parent_id, rel_path, name, kind, mime, bytes, child_count, sha256, integrity, dev, ino, modified_at, added_at, rev, etag, outside, thumb_state)
      with recursive n(i) as (select 0 union all select i + 1 from n where i < ${String(FILES - 1)})
      select '0d000000-0000-4000-8000-' || printf('%012d', i + 100), '${ROOT}', (select max(id) from drive_inodes), '0e000000-0000-4000-8000-' || printf('%012d', i % ${String(FOLDERS)}), 'd' || (i % ${String(FOLDERS)}) || '/n' || i, 'n' || i, 'document', 'text/plain', 1, null, null, 'unknown', '1', 'i' || i, '${NOW}', '${NOW}', 1, '1-0.0', 0, 'none' from n`);
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
      inodes: new DriveInodesRepository(context),
      missing: new DriveMissingRepository(context),
      now: () => new Date(NOW),
      newId: randomUUID,
      write: (work) => context.write(work),
    };
    const committer = new ScanCommitter(dependencies, roots.byId(ROOT), null);
    while (committer.load());
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
      merge: (_queued, next): Job => next,
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
      merge: (_queued, next): Job => next,
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
      merge: (_queued, next): Job => next,
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
      merge: (_queued, next): Job => next,
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
      text: () => Promise.resolve(),
      reflect: () => Promise.resolve(),
    });
    await run(job, new AbortController().signal);
    expect(handled).toEqual([ROOT]);
  });
});
