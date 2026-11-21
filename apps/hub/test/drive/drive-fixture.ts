import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DriveRoot } from '@smarteverything/domain';
import { build } from 'esbuild';
import { DatabaseSync } from 'node:sqlite';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { DriveItemsRepository } from '../../src/store/repositories/drive-items';
import { DriveOpensRepository } from '../../src/store/repositories/drive-opens';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { DriveBlocksRepository } from '../../src/store/repositories/drive-blocks';
import { DrivePlacementsRepository } from '../../src/store/repositories/drive-placements';
import { DriveRootsRepository, type StoredDrive } from '../../src/store/repositories/drive-roots';
import { SettingsKvRepository } from '../../src/store/repositories/settings-kv';
import { Sql } from '../../src/store/sql';
import { driveFolderOf, type DriveFolders } from '../../src/data-layout/drive-folders';
import { testLogger } from '../support/logs';

export const NOW = '2026-11-07T00:00:00.000Z';

const FIXTURE_HOME = '/fixture/home/drive';

const FIXTURE_PEOPLE = { parent: '/fixture/people', leaf: 'drive' };

export interface DriveFixture {
  readonly database: DatabaseSync;
  readonly context: StoreContext;
  readonly feed: ChangeFeed;
  readonly roots: DriveRootsRepository;
  readonly placements: DrivePlacementsRepository;
  readonly syncRoot: (rootId: string) => void;
  readonly folders: DriveFolders;
  readonly addDrive: (root: DriveRoot, path: string) => StoredDrive;
  readonly items: DriveItemsRepository;
  readonly blocks: DriveBlocksRepository;
  readonly opens: DriveOpensRepository;
  readonly profiles: ProfilesRepository;
  readonly settings: SettingsKvRepository;
}

export function openDriveFixture(): DriveFixture {
  const database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const log = testLogger();
  const feed = new ChangeFeed(log);
  const sql = new Sql(database);
  const context = new StoreContext(sql, feed, () => new Date(NOW));
  migrate(sql, MIGRATIONS, NOW, log);
  const folders: DriveFolders = { home: FIXTURE_HOME, people: FIXTURE_PEOPLE };
  const roots = new DriveRootsRepository(context, folders);
  return {
    database,
    context,
    feed,
    roots,
    placements: new DrivePlacementsRepository(context),
    syncRoot: (rootId): void => {
      database.exec('pragma foreign_keys = off');
      database
        .prepare(
          `insert into drive_placements (id, device_id, root_id, folder_item_id, mode, local_path,
            enabled, created_by, created_at, excluded, ignore_patterns, conflict_copies, state,
            read_only, cache_bytes, pinned_bytes, open_files, pending_uploads, need_bytes, errors,
            reported_at)
            values (?, ?, ?, null, 'synced', '/sync', 1, ?, ?, '[]', '[]', 1, 'up_to_date', 0, 0, 0,
              0, 0, 0, '[]', ?)`,
        )
        .run(randomUUID(), randomUUID(), rootId, randomUUID(), NOW, NOW);
      database.exec('pragma foreign_keys = on');
    },
    folders,
    addDrive: (root, path): StoredDrive => {
      if (root.scope === 'home') folders.home = path;
      else if (driveFolderOf(folders, root.scope, root.ownerProfileId) !== path)
        throw new Error(`The fixture places a personal drive at its owner's folder, not ${path}.`);
      return roots.insert(root);
    },
    items: new DriveItemsRepository(context),
    blocks: new DriveBlocksRepository(context),
    opens: new DriveOpensRepository(context),
    profiles: new ProfilesRepository(context),
    settings: new SettingsKvRepository(context),
  };
}

export function driveRoot(id: string, fields: Partial<DriveRoot> = {}): DriveRoot {
  return {
    id,
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
    ...fields,
  };
}

export async function bundleWorker(source: string, outfile: string): Promise<void> {
  await build({
    entryPoints: [fileURLToPath(new URL(`../../src/drive/${source}`, import.meta.url))],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    logLevel: 'silent',
  });
}

const REPOSITORY_TMP = fileURLToPath(new URL('../../../../tmp/', import.meta.url));

const ESM_BANNER =
  'import { createRequire as createServiceRequire } from "node:module"; import { fileURLToPath as serviceFileUrlToPath } from "node:url"; import { dirname as serviceDirname } from "node:path"; const require = createServiceRequire(import.meta.url); const __filename = serviceFileUrlToPath(import.meta.url); const __dirname = serviceDirname(__filename);';

export interface BundledWorker {
  readonly script: string;
  readonly dispose: () => void;
}

export async function bundleMetadataWorker(): Promise<BundledWorker> {
  mkdirSync(REPOSITORY_TMP, { recursive: true });
  const folder = mkdtempSync(join(REPOSITORY_TMP, 'hub-metadata-worker-'));
  const script = join(folder, 'metadata-worker.mjs');
  await build({
    entryPoints: [fileURLToPath(new URL('../../src/drive/metadata-worker.ts', import.meta.url))],
    outfile: script,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    external: ['mediainfo.js'],
    banner: { js: ESM_BANNER },
    logLevel: 'silent',
  });
  return {
    script,
    dispose: (): void => {
      rmSync(folder, { recursive: true, force: true });
    },
  };
}

export async function bundleHashWorker(): Promise<BundledWorker> {
  mkdirSync(REPOSITORY_TMP, { recursive: true });
  const folder = mkdtempSync(join(REPOSITORY_TMP, 'hub-hash-worker-'));
  const script = join(folder, 'hasher-worker.mjs');
  await bundleWorker('hasher-worker.ts', script);
  return {
    script,
    dispose: (): void => {
      rmSync(folder, { recursive: true, force: true });
    },
  };
}
