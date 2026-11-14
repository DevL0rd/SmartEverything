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
import { hashRequested, type HashResponse } from '../../src/drive/blocks';
import {
  BACKUP_DATABASE_FILE,
  BACKUP_MANIFEST_LINE,
  BackupCopyError,
  DriveBackups,
} from '../../src/drive/backups';
import { scanHandler, type ScanEnvironment } from '../../src/drive/jobs';
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
import { testLogger } from '../support/logs';
import { bundleWorker, driveRoot } from './drive-fixture';

const ROOT = '0d000000-0000-4000-8000-000000000002';
const START = Date.parse('2026-11-07T00:00:00.000Z');

let bundleFolder = '';
let scannerScript = '';
let hasherScript = '';
let tree = '';
let database: DatabaseSync;
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
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const log = testLogger();
  feed = new ChangeFeed(log);
  const sql = new Sql(database);
  context = new StoreContext(sql, feed, clock);
  migrate(sql, MIGRATIONS, new Date(START).toISOString(), log);
  roots = new DriveRootsRepository(context, () => tree);
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
});

function put(path: string, content: string | Buffer): void {
  const full = join(tree, path);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
}

const signal = (): AbortSignal => new AbortController().signal;

async function indexAndHash(): Promise<void> {
  const scanEnv: ScanEnvironment = {
    store: {
      driveRoots: roots,
      driveItems: items,
      feed,
      write: (w) => context.write(w),
      now: clock,
    },
    availability: () => Promise.resolve('online'),
    workerScript: scannerScript,
    log: testLogger(),
  };
  await scanHandler(scanEnv)({ kind: 'scan', rootId: ROOT }, signal());
  const hashEnv: HashEnvironment = {
    store: {
      driveRoots: roots,
      driveItems: items,
      driveBlocks: new DriveBlocksRepository(context),
      drivePlacements: new DrivePlacementsRepository(context),
      settingsKv: new SettingsKvRepository(context),
      feed,
      write: (w) => context.write(w),
    },
    availability: () => Promise.resolve('online'),
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
  const environment: ScrubEnvironment = {
    store: {
      driveRoots: roots,
      driveItems: {
        find: (id: string, viewer: string | null) => items.find(id, viewer),
        identityOf: (id) => items.identityOf(id),
        setIntegrity: (id, integrity) => {
          database.prepare('update drive_items set integrity = $integrity where id = $id').run({
            id,
            integrity,
          });
        },
      },
      driveScrub: scrubs,
      feed,
      write: (w) => context.write(w),
      now: clock,
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
  if (item === undefined || item.kind === 'folder') throw new Error(`${path} is not a file`);
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
    run.start();
    await run.settled();
    const state = run.state();
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
    first.start();
    await first.settled();
    flipByte('docs/b.txt');
    const flipped = readFileSync(join(tree, 'docs/b.txt'));
    const second = scrubber();
    second.start();
    await second.settled();
    expect(integrityOf('docs/b.txt')).toBe('corrupt');
    expect(integrityOf('a.txt')).toBe('ok');
    expect(scrubs.find(items.byPath(ROOT, 'docs/b.txt', null)?.id ?? '')?.result).toBe('corrupt');
    expect(corruptions).toHaveLength(1);
    expect(corruptions[0]).toMatchObject({ rootId: ROOT, relPath: 'docs/b.txt' });
    expect(corruptions[0]?.expected).not.toBe(corruptions[0]?.actual);
    expect(readFileSync(join(tree, 'docs/b.txt'))).toEqual(flipped);
    expect(roots.byId(ROOT).health.corrupt).toBe(1);
    expect(second.state()).toMatchObject({ state: 'idle', corrupt: 1 });
  });

  it('does not call a file corrupt when its size or time changed since it was hashed', async () => {
    writeFileSync(join(tree, 'a.txt'), 'alpha, edited');
    const run = scrubber();
    run.start();
    await run.settled();
    expect(corruptions).toEqual([]);
    expect(integrityOf('a.txt')).toBe('unknown');
    expect(scrubs.verified(ROOT)).toBe(2);
  });

  it('clears a corrupt mark when the file verifies again', async () => {
    const first = scrubber();
    first.start();
    await first.settled();
    flipByte('a.txt');
    const second = scrubber();
    second.start();
    await second.settled();
    expect(integrityOf('a.txt')).toBe('corrupt');
    flipByte('a.txt');
    const third = scrubber();
    third.start();
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
    run.start();
    await run.settled();
    expect(run.state()).toMatchObject({ state: 'stopped', checked: 2, total: 3 });
    expect(roots.byId(ROOT).health.lastScrubAt).toBeNull();
    const verifiedBefore = [...requests];
    requests.length = 0;
    run.start();
    expect(run.state().state).toBe('running');
    await run.settled();
    expect(run.state()).toMatchObject({ state: 'idle' });
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
    run.start();
    run.start();
    await run.settled();
    expect(opened).toBe(1);
    expect(requests).toHaveLength(3);
  });

  it('starts a fresh pass after a complete one', async () => {
    const run = scrubber();
    run.start();
    await run.settled();
    requests.length = 0;
    run.start();
    await run.settled();
    expect(requests).toHaveLength(3);
  });

  it('leaves a drive whose folder is missing alone', async () => {
    const run = scrubber(inProcessHasher(), () => Promise.resolve('missing'));
    run.start();
    await run.settled();
    expect(requests).toEqual([]);
    expect(roots.byId(ROOT).health.lastScrubAt).toBeNull();
  });
});

describe('backups', () => {
  function service(): DriveBackups {
    return new DriveBackups({
      database,
      store: { driveRoots: roots, driveItems: items, driveTrash: trash, driveBackups: backups },
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

  it('records a reported backup, stamps the roots and warns until then', () => {
    const backup = service();
    expect(backup.unprotectedRoots().map((root) => root.id)).toEqual([ROOT]);
    expect(backup.status()).toEqual({ last: null, lastOkAt: null });
    backup.report({ reporter: 'nightly-job', bytes: 10, ok: false });
    expect(backup.unprotectedRoots()).toHaveLength(1);
    const ok = backup.report({ reporter: 'nightly-job', bytes: 2048, ok: true });
    expect(backup.unprotectedRoots()).toEqual([]);
    expect(roots.byId(ROOT).health.lastBackupAt).toBe(ok.at);
    expect(backup.status()).toEqual({ last: ok, lastOkAt: ok.at });
  });
});
