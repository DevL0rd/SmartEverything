import { fileURLToPath } from 'node:url';
import type { DriveRoot } from '@smarteverything/domain';
import { build } from 'esbuild';
import { DatabaseSync } from 'node:sqlite';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { DriveBlocksRepository } from '../../src/store/repositories/drive-blocks';
import { DriveItemsRepository } from '../../src/store/repositories/drive-items';
import { DriveRootsRepository, UNSYNCED } from '../../src/store/repositories/drive-roots';
import { SettingsKvRepository } from '../../src/store/repositories/settings-kv';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

export const NOW = '2026-11-07T00:00:00.000Z';

export interface DriveFixture {
  readonly database: DatabaseSync;
  readonly context: StoreContext;
  readonly feed: ChangeFeed;
  readonly roots: DriveRootsRepository;
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
  return {
    database,
    context,
    feed,
    roots: new DriveRootsRepository(context),
    items: new DriveItemsRepository(context),
    blocks: new DriveBlocksRepository(context),
    settings: new SettingsKvRepository(context),
  };
}

export function folderRoot(
  id: string,
  path: string,
  fields: Partial<Extract<DriveRoot, { kind: 'folder' }>> = {},
): DriveRoot {
  return {
    id,
    kind: 'folder',
    label: 'Library',
    scope: 'home',
    ownerProfileId: null,
    path,
    readOnly: true,
    versions: false,
    volume: null,
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
    inPhotos: false,
    skipPatterns: [],
    includeHidden: false,
    synced: false,
    sync: UNSYNCED,
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
