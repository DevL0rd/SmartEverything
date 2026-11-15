import { availableParallelism } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { z } from 'zod';
import { DRIVE_SETTINGS } from '../../../../packages/domain/src/drive/settings';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { DRIVE_MOUNT_TUNING_MIGRATION } from '../../src/store/migrations/drive-mount-tuning';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const NOW = '2026-11-15T00:00:00.000Z';

let database: DatabaseSync;
let sql: Sql;

function saved(): unknown {
  const row = sql.get(
    z.object({ settings: z.string() }),
    "select settings from ai_settings where key = 'drive'",
  );
  return JSON.parse(row?.settings ?? '');
}

beforeEach(() => {
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const log = testLogger();
  const context = new StoreContext(new Sql(database), new ChangeFeed(log), () => new Date(NOW));
  sql = context.sql;
  migrate(
    sql,
    MIGRATIONS.filter((migration) => migration.version < DRIVE_MOUNT_TUNING_MIGRATION.version),
    NOW,
    log,
  );
});

afterEach(() => {
  database.close();
});

it('seeds the mount tuning settings and keeps the stored ones', () => {
  expect(DRIVE_SETTINGS.safeParse(saved()).success).toBe(false);
  migrate(sql, MIGRATIONS, NOW, testLogger());
  expect(DRIVE_SETTINGS.parse(saved())).toMatchObject({
    uploadExpiryDays: 7,
    contentIndexing: true,
    fileIoThreads: 8,
    cpuWorkers: availableParallelism(),
    listingCacheSeconds: 300,
  });
});
