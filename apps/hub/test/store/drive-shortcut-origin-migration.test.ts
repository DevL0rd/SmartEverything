import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { z } from 'zod';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { DRIVE_SHORTCUT_ORIGIN_MIGRATION } from '../../src/store/migrations/drive-shortcut-origin';
import { DriveRootsRepository } from '../../src/store/repositories/drive-roots';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';
import { sharedDriveRoot } from './drive-roots-fixture';

const NOW = '2026-11-15T00:00:00.000Z';
const ROOT = '0d000000-0000-4000-8000-000000000001';
const TARGET = '0d000000-0000-4000-8000-0000000000f2';

let database: DatabaseSync;
let sql: Sql;
let profile: string;

function shortcut(id: string, name: string, via: string | null): void {
  const columns = via === null ? '' : ', created_via';
  const values = via === null ? '' : ', ?';
  database
    .prepare(
      `insert into drive_shortcuts (id, root_id, parent_item_id, target_item_id, name, created_by,
        created_at${columns}) values (?, ?, null, ?, ?, ?, ?${values})`,
    )
    .run(id, ROOT, TARGET, name, profile, NOW, ...(via === null ? [] : [via]));
}

beforeEach(() => {
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  sql = new Sql(database);
  migrate(
    sql,
    MIGRATIONS.filter((migration) => migration.version < DRIVE_SHORTCUT_ORIGIN_MIGRATION.version),
    NOW,
    testLogger(),
  );
  const context = new StoreContext(sql, new ChangeFeed(testLogger()), () => new Date(NOW));
  profile = new ProfilesRepository(context).create({ name: 'Alice' }).id;
  new DriveRootsRepository(context, {
    home: '/drives',
    people: { parent: '/drives/people', leaf: '' },
  }).insert(sharedDriveRoot(ROOT));
  shortcut('before', 'Old link', null);
});

afterEach(() => {
  database.close();
});

it('marks the shortcuts made before as made in the app and stores how each new one was made', () => {
  migrate(sql, MIGRATIONS, NOW, testLogger());
  shortcut('after', 'New link', 'ai');
  expect(() => {
    shortcut('refused', 'Bad link', 'nowhere');
  }).toThrow(/constraint/u);
  const rows = z
    .array(z.strictObject({ id: z.string(), created_via: z.string() }))
    .parse(database.prepare('select id, created_via from drive_shortcuts order by id').all());
  expect(rows).toEqual([
    { id: 'after', created_via: 'ai' },
    { id: 'before', created_via: 'app' },
  ]);
});
