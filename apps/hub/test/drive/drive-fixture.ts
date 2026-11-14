import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { DriveRoot } from '@smarteverything/domain';
import { build } from 'esbuild';
import { DatabaseSync } from 'node:sqlite';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { DriveItemsRepository } from '../../src/store/repositories/drive-items';
import { DriveBlocksRepository } from '../../src/store/repositories/drive-blocks';
import { DrivePlacementsRepository } from '../../src/store/repositories/drive-placements';
import { DriveRootsRepository, type StoredDrive } from '../../src/store/repositories/drive-roots';
import { SettingsKvRepository } from '../../src/store/repositories/settings-kv';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

export const NOW = '2026-11-07T00:00:00.000Z';

export interface DriveFixture {
  readonly database: DatabaseSync;
  readonly context: StoreContext;
  readonly feed: ChangeFeed;
  readonly roots: DriveRootsRepository;
  readonly placements: DrivePlacementsRepository;
  readonly syncRoot: (rootId: string) => void;
  readonly addDrive: (root: DriveRoot, path: string) => StoredDrive;
  readonly items: DriveItemsRepository;
  readonly blocks: DriveBlocksRepository;
  readonly settings: SettingsKvRepository;
}

export function openDriveFixture(): DriveFixture {
  const database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const log = testLogger();
  const feed = new ChangeFeed(log);
  const sql = new Sql(database);
  const context = new StoreContext(sql, feed, () => new Date(NOW));
  migrate(sql, MIGRATIONS, NOW, log);
  const paths = new Map<string, string>();
  const roots = new DriveRootsRepository(context, (scope, owner) => {
    const path = paths.get(`${scope}:${String(owner)}`);
    if (path === undefined)
      throw new Error(`The fixture drive ${scope}:${String(owner)} has no folder.`);
    return path;
  });
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
    addDrive: (root, path): StoredDrive => {
      paths.set(`${root.scope}:${String(root.ownerProfileId)}`, path);
      return roots.insert(root);
    },
    items: new DriveItemsRepository(context),
    blocks: new DriveBlocksRepository(context),
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
