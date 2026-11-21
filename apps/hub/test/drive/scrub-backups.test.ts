import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashHandler, type HashEnvironment } from '../../src/drive/hasher';
import {
  collectBacklog,
  hashStart,
  recordHash,
  recordHashHealth,
} from '../../src/drive/units/hash';
import { hashRequested, type HashResponse } from '../../src/drive/blocks';
import { isFileItem } from '../../src/drive/file-item';
import {
  BACKUP_DATABASE_FILE,
  BACKUP_MANIFEST_LINE,
  BackupCopyError,
  DriveBackups,
} from '../../src/drive/backups';
import { scanHandler, type ScanEnvironment } from '../../src/drive/jobs';
import { DriveRootLanes } from '../../src/drive/root-lanes';
import {
  scrubHealthIn,
  scrubOverviewIn,
  scrubRecordIn,
  scrubWindowIn,
  type ScrubStore,
} from '../../src/drive/units/scrub';
import {
  DriveScrubber,
  type FileHasher,
  type ScrubCorruption,
  type ScrubEnvironment,
} from '../../src/drive/scrub';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { DriveBackupsRepository } from '../../src/store/repositories/drive-backups';
import { DrivePlacementsRepository } from '../../src/store/repositories/drive-placements';
import { DriveBlocksRepository } from '../../src/store/repositories/drive-blocks';
import { DriveItemsRepository } from '../../src/store/repositories/drive-items';
import { DriveRootsRepository } from '../../src/store/repositories/drive-roots';
import { DriveScrubRepository } from '../../src/store/repositories/drive-scrub';
import { DriveTrashRepository } from '../../src/store/repositories/drive-trash';
import { SettingsKvRepository } from '../../src/store/repositories/settings-kv';
import { Sql } from '../../src/store/sql';
import { backupReport } from '../../src/drive/units/health';
import { testLogger } from '../support/logs';
import { bundleWorker, driveRoot } from './drive-fixture';
import { localScans } from './local-ports';

const ROOT = '0d000000-0000-4000-8000-000000000002';
const START = Date.parse('2026-11-07T00:00:00.000Z');

let bundleFolder = '';
let scannerScript = '';
let hasherScript = '';
let tree = '';
let database: DatabaseSync;
let source = '';
let context: StoreContext;
let feed: ChangeFeed;
let roots: DriveRootsRepository;
let items: DriveItemsRepository;
let scrubs: DriveScrubRepository;
let backups: DriveBackupsRepository;
let trash: DriveTrashRepository;
let corruptions: ScrubCorruption[];
let requests: string[];
let tick = 0;

const clock = (): Date => {
  tick += 1000;
  return new Date(START + tick);
};

beforeAll(async () => {
  bundleFolder = mkdtempSync(join(tmpdir(), 'scrub-bundle-'));
  scannerScript = join(bundleFolder, 'scanner-worker.mjs');
  hasherScript = join(bundleFolder, 'hasher-worker.mjs');
  await bundleWorker('scanner-worker.ts', scannerScript);
  await bundleWorker('hasher-worker.ts', hasherScript);
});

afterAll(() => {
  rmSync(bundleFolder, { recursive: true, force: true });
});

beforeEach(() => {
  tick = 0;
  tree = mkdtempSync(join(tmpdir(), 'scrub-tree-'));
  source = mkdtempSync(join(tmpdir(), 'scrub-source-'));
  database = new DatabaseSync(join(source, 'source.sqlite'), { enableForeignKeyConstraints: true });
  database.exec('pragma journal_mode = wal');
  const log = testLogger();
  feed = new ChangeFeed(log);
  const sql = new Sql(database);
  context = new StoreContext(sql, feed, clock);
  migrate(sql, MIGRATIONS, new Date(START).toISOString(), log);
  roots = new DriveRootsRepository(context, {
    home: tree,
    people: { parent: join(tree, 'people'), leaf: '' },
  });
  items = new DriveItemsRepository(context);
  scrubs = new DriveScrubRepository(context);
  backups = new DriveBackupsRepository(context);
  trash = new DriveTrashRepository(context);
  roots.insert(driveRoot(ROOT));
  corruptions = [];
  requests = [];
});

afterEach(() => {
  database.close();
  rmSync(tree, { recursive: true, force: true });
  rmSync(source, { recursive: true, force: true });
});

function put(path: string, content: string | Buffer): void {
  const full = join(tree, path);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
}

const signal = (): AbortSignal => new AbortController().signal;

async function indexAndHash(): Promise<void> {
  const scanEnv: ScanEnvironment = {
    ...localScans({
      roots,
      items,
      context,
      feed,
      now: clock,
    }),
    availability: () => Promise.resolve('online'),
    mounted: () => Promise.resolve(false),
    workerScript: scannerScript,
    lanes: new DriveRootLanes(),
    log: testLogger(),
  };
  await scanHandler(scanEnv)({ kind: 'scan', rootId: ROOT }, signal());
  const hashStore = {
    driveRoots: roots,
    driveItems: items,
    driveBlocks: new DriveBlocksRepository(context),
    drivePlacements: new DrivePlacementsRepository(context),
    settingsKv: new SettingsKvRepository(context),
  };
  const hashEnv: HashEnvironment = {
    store: { feed },
    availability: () => Promise.resolve('online'),
    start: (rootId) => Promise.resolve(hashStart(hashStore, rootId)),
    backlog: (rootId) => Promise.resolve(collectBacklog(hashStore, rootId)),
    record: (input) => Promise.resolve(context.write(() => recordHash(hashStore, input))),
    health: (input) => {
      context.write(() => {
        recordHashHealth(hashStore, input);
      });
      return Promise.resolve();
    },
    workerScript: hasherScript,
    log: testLogger(),
  };
  await hashHandler(hashEnv)({ kind: 'hash', rootId: ROOT }, signal());
}

function inProcessHasher(afterRequest?: (count: number) => void): () => FileHasher {
  return () => ({
    request: async (fields): Promise<HashResponse> => {
      requests.push(fields.relPath);
      const response = await hashRequested({ ...fields, id: requests.length });
      afterRequest?.(requests.length);
      return response;
    },
    close: () => Promise.resolve(),
  });
}

function scrubber(
  openHasher: () => FileHasher = inProcessHasher(),
  availability: ScrubEnvironment['availability'] = () => Promise.resolve('online'),
): DriveScrubber {
  const unitStore: ScrubStore = {
    driveRoots: roots,
    driveItems: items,
    driveScrub: scrubs,
    context,
  };
  const environment: ScrubEnvironment = {
    store: { feed, now: clock },
    units: {
      window: (input) => Promise.resolve(scrubWindowIn(unitStore, input)),
      record: (input) => {
        context.write(() => {
          scrubRecordIn(unitStore, input);
        });
        return Promise.resolve();
      },
      overview: () => Promise.resolve(scrubOverviewIn(unitStore)),
      health: (input) => {
        context.write(() => {
          scrubHealthIn(unitStore, input);
        });
        return Promise.resolve();
      },
    },
    availability,
    openHasher,
    notifyOwner: (corruption) => {
      corruptions.push(corruption);
    },
    log: testLogger(),
  };
  return new DriveScrubber(environment);
}

function integrityOf(path: string): string {
  const item = items.byPath(ROOT, path, null);
  if (item === undefined || !isFileItem(item)) throw new Error(`${path} is not a file`);
  return item.integrity;
}

function flipByte(path: string): void {
  const full = join(tree, path);
  const before = statSync(full);
  const bytes = readFileSync(full);
  bytes[0] = (bytes[0] ?? 0) ^ 0xff;
  writeFileSync(full, bytes);
  utimesSync(full, before.atimeMs / 1000, before.mtimeMs / 1000);
}

describe('scrubbing hashed files', () => {
  beforeEach(async () => {
    put('a.txt', 'alpha');
    put('docs/b.txt', 'bravo');
    put('docs/c.txt', 'charlie');
    await indexAndHash();
  });

  it('verifies every hashed file, records it and stamps the root', async () => {
    const run = scrubber();
    await run.start();
    await run.settled();
    const state = await run.state();
    expect(state).toMatchObject({ state: 'idle', corrupt: 0 });
    expect(state.state === 'idle' ? state.lastFinishedAt : null).not.toBeNull();
    expect(scrubs.verified(ROOT)).toBe(3);
    const root = roots.byId(ROOT);
    expect(root.health.verifiedShare).toBe(1);
    expect(root.health.lastScrubAt).not.toBeNull();
    expect(corruptions).toEqual([]);
  });

  it('marks a bit flip corrupt, tells the owner and leaves the file untouched', async () => {
    const first = scrubber();
    await first.start();
    await first.settled();
    flipByte('docs/b.txt');
    const flipped = readFileSync(join(tree, 'docs/b.txt'));
    const second = scrubber();
    await second.start();
    await second.settled();
    expect(integrityOf('docs/b.txt')).toBe('corrupt');
    expect(integrityOf('a.txt')).toBe('ok');
    expect(scrubs.find(items.byPath(ROOT, 'docs/b.txt', null)?.id ?? '')?.result).toBe('corrupt');
    expect(corruptions).toHaveLength(1);
    expect(corruptions[0]).toMatchObject({ rootId: ROOT, relPath: 'docs/b.txt' });
    expect(corruptions[0]?.expected).not.toBe(corruptions[0]?.actual);
    expect(readFileSync(join(tree, 'docs/b.txt'))).toEqual(flipped);
    expect(roots.byId(ROOT).health.corrupt).toBe(1);
    expect(await second.state()).toMatchObject({ state: 'idle', corrupt: 1 });
  });

  it('marks a file the filesystem cannot read back as corrupt and tells the owner', async () => {
    const real = inProcessHasher()();
    const failing: () => FileHasher = () => ({
      request: async (fields) =>
        fields.relPath === 'docs/b.txt'
          ? { kind: 'skipped', id: 1, reason: 'unreadable', code: 'EIO' }
          : real.request(fields),
      close: () => Promise.resolve(),
    });
    const run = scrubber(failing);
    await run.start();
    await run.settled();
    expect(integrityOf('docs/b.txt')).toBe('corrupt');
    expect(integrityOf('a.txt')).toBe('ok');
    expect(corruptions).toHaveLength(1);
    expect(corruptions[0]).toMatchObject({
      relPath: 'docs/b.txt',
      cause: 'filesystem',
      actual: 'unreadable:EIO',
    });
    expect(await run.state()).toMatchObject({ state: 'idle', corrupt: 1 });
  });

  it('only warns about a file that is unreadable for another reason', async () => {
    const real = inProcessHasher()();
    const denied: () => FileHasher = () => ({
      request: async (fields) =>
        fields.relPath === 'docs/b.txt'
          ? { kind: 'skipped', id: 1, reason: 'unreadable', code: 'EACCES' }
          : real.request(fields),
      close: () => Promise.resolve(),
    });
    const run = scrubber(denied);
    await run.start();
    await run.settled();
    expect(corruptions).toEqual([]);
    expect(integrityOf('docs/b.txt')).toBe('unknown');
  });

  it('does not call a file corrupt when its size or time changed since it was hashed', async () => {
    writeFileSync(join(tree, 'a.txt'), 'alpha, edited');
    const run = scrubber();
    await run.start();
    await run.settled();
    expect(corruptions).toEqual([]);
    expect(integrityOf('a.txt')).toBe('unknown');
    expect(scrubs.verified(ROOT)).toBe(2);
  });

  it('clears a corrupt mark when the file verifies again', async () => {
    const first = scrubber();
    await first.start();
    await first.settled();
    flipByte('a.txt');
    const second = scrubber();
    await second.start();
    await second.settled();
    expect(integrityOf('a.txt')).toBe('corrupt');
    flipByte('a.txt');
    const third = scrubber();
    await third.start();
    await third.settled();
    expect(integrityOf('a.txt')).toBe('ok');
    expect(roots.byId(ROOT).health.corrupt).toBe(0);
  });

  it('resumes after a stop without verifying the same files again', async () => {
    const holder: { run?: DriveScrubber } = {};
    const run = scrubber(
      inProcessHasher((count) => {
        if (count === 2) holder.run?.stop();
      }),
    );
    holder.run = run;
    await run.start();
    await run.settled();
    expect(await run.state()).toMatchObject({ state: 'stopped', checked: 2, total: 3 });
    expect(roots.byId(ROOT).health.lastScrubAt).toBeNull();
    const verifiedBefore = [...requests];
    requests.length = 0;
    await run.start();
    expect((await run.state()).state).toBe('running');
    await run.settled();
    expect(await run.state()).toMatchObject({ state: 'idle' });
    expect(requests).toHaveLength(1);
    expect(verifiedBefore).not.toContain(requests[0]);
    expect(scrubs.verified(ROOT)).toBe(3);
    expect(roots.byId(ROOT).health.lastScrubAt).not.toBeNull();
  });

  it('runs one job per start and a second start joins it', async () => {
    let opened = 0;
    const run = scrubber(() => {
      opened += 1;
      return inProcessHasher()();
    });
    await run.start();
    await run.start();
    await run.settled();
    expect(opened).toBe(1);
    expect(requests).toHaveLength(3);
  });

  it('starts a fresh pass after a complete one', async () => {
    const run = scrubber();
    await run.start();
    await run.settled();
    requests.length = 0;
    await run.start();
    await run.settled();
    expect(requests).toHaveLength(3);
  });

  it('leaves a drive whose folder is missing alone', async () => {
    const run = scrubber(inProcessHasher(), () => Promise.resolve('missing'));
    await run.start();
    await run.settled();
    expect(requests).toEqual([]);
    expect(roots.byId(ROOT).health.lastScrubAt).toBeNull();
  });
});

describe('backups', () => {
  function service(): DriveBackups {
    return new DriveBackups({
      database: join(source, 'source.sqlite'),
      busyTimeoutMs: 5000,
      store: {
        roots: () => Promise.resolve(roots.list()),
        children: (request) => Promise.resolve(items.children(request)),
        trashInRoot: (rootId, after, limit) => Promise.resolve(trash.inRoot(rootId, after, limit)),
        report: (input) =>
          Promise.resolve(
            context.write(() => backupReport({ driveBackups: backups, driveRoots: roots }, input)),
          ),
        status: () => Promise.resolve(backups.status()),
      },
      log: testLogger(),
    });
  }

  let target = '';

  beforeEach(async () => {
    target = mkdtempSync(join(tmpdir(), 'scrub-backup-'));
    put('a.txt', 'alpha');
    put('docs/b.txt', 'bravo');
    await indexAndHash();
  });

  afterEach(() => {
    rmSync(target, { recursive: true, force: true });
  });

  it('copies the database consistently and lists every file in the manifest', async () => {
    const snapshot = await service().snapshot(join(target, 'one'));
    const copy = new DatabaseSync(snapshot.database, { readOnly: true });
    const count = copy.prepare('select count(*) as count from drive_items').get();
    copy.close();
    expect(count).toEqual({ count: 3 });
    const lines = readFileSync(snapshot.manifest, 'utf8')
      .trim()
      .split('\n')
      .map((line) => BACKUP_MANIFEST_LINE.parse(JSON.parse(line)));
    expect(lines.filter((line) => line.kind === 'root')).toHaveLength(1);
    expect(
      lines
        .filter((line) => line.kind === 'file')
        .map((line) => line.relPath)
        .sort(),
    ).toEqual(['a.txt', 'docs/b.txt']);
    expect(snapshot.files).toBe(2);
    expect(snapshot.bytes).toBeGreaterThan(0);
  });

  it('never overwrites an earlier copy', async () => {
    const folder = join(target, 'two');
    await service().snapshot(folder);
    await expect(service().snapshot(folder)).rejects.toBeInstanceOf(BackupCopyError);
    expect(statSync(join(folder, BACKUP_DATABASE_FILE)).size).toBeGreaterThan(0);
  });

  it('records a reported backup, stamps the roots and warns until then', async () => {
    const backup = service();
    expect((await backup.unprotectedRoots()).map((root) => root.id)).toEqual([ROOT]);
    expect(await backup.status()).toEqual({ last: null, lastOkAt: null });
    await backup.report({ reporter: 'nightly-job', bytes: 10, ok: false });
    expect(await backup.unprotectedRoots()).toHaveLength(1);
    const ok = await backup.report({ reporter: 'nightly-job', bytes: 2048, ok: true });
    expect(await backup.unprotectedRoots()).toEqual([]);
    expect(roots.byId(ROOT).health.lastBackupAt).toBe(ok.at);
    expect(await backup.status()).toEqual({ last: ok, lastOkAt: ok.at });
  });
});
