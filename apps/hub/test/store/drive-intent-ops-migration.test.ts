import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { DRIVE_INTENT_OPS_MIGRATION } from '../../src/store/migrations/drive-intent-ops';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { DriveRootsRepository } from '../../src/store/repositories/drive-roots';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';
import { driveFolders, sharedDriveRoot } from './drive-roots-fixture';

const NOW = '2026-11-14T09:00:00.000Z';
const ROOT = '0d000000-0000-4000-8000-000000000071';

let database: DatabaseSync;

beforeEach(() => {
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
});

afterEach(() => {
  database.close();
});

function migrateTo(version: number): void {
  migrate(
    new Sql(database),
    MIGRATIONS.filter((migration) => migration.version <= version),
    NOW,
    testLogger(),
  );
}

function addDrive(): void {
  const context = new StoreContext(
    new Sql(database),
    new ChangeFeed(testLogger()),
    () => new Date(NOW),
  );
  new DriveRootsRepository(context, driveFolders).insert(sharedDriveRoot(ROOT));
}

function insert(id: string, op: string, versionPath: string | null): void {
  database
    .prepare(
      'insert into drive_intents (id, root_id, op, from_path, to_path, version_path, at) values (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(id, ROOT, op, 'from', 'to', versionPath, NOW);
}

describe('the drive intent ops migration', () => {
  it('keeps the open intents and lets patch and exchange intents in', () => {
    migrateTo(DRIVE_INTENT_OPS_MIGRATION.version - 1);
    addDrive();
    insert('old-commit', 'commit', 'versions/ab/abc');
    insert('old-trash', 'trash', null);
    expect(() => {
      insert('too-early', 'patch', null);
    }).toThrow();
    migrateTo(DRIVE_INTENT_OPS_MIGRATION.version);
    const rows = database
      .prepare('select id, op, version_path from drive_intents order by id')
      .all();
    expect(rows).toEqual([
      { id: 'old-commit', op: 'commit', version_path: 'versions/ab/abc' },
      { id: 'old-trash', op: 'trash', version_path: null },
    ]);
    insert('patch-with-version', 'patch', 'versions/cd/cde');
    insert('patch-without', 'patch', null);
    insert('exchange', 'exchange', null);
    expect(database.prepare('select count(*) as n from drive_intents').get()).toEqual({ n: 5 });
  });

  it('still refuses a version path on the other ops and unknown ops', () => {
    migrateTo(DRIVE_INTENT_OPS_MIGRATION.version);
    addDrive();
    for (const op of ['trash', 'restore', 'exchange']) {
      expect(() => {
        insert(`bad-${op}`, op, 'versions/ab/abc');
      }).toThrow();
    }
    expect(() => {
      insert('unknown', 'delete', null);
    }).toThrow();
  });

  it('keeps the root index', () => {
    migrateTo(DRIVE_INTENT_OPS_MIGRATION.version);
    const indexes = database.prepare("pragma index_list('drive_intents')").all();
    expect(indexes.map((index) => index['name'])).toContain('drive_intents_by_root');
  });
});
