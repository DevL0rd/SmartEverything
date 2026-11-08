import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { ANDROID_BUILD_OUTCOMES_MIGRATION } from '../../src/store/migrations/android-build-outcomes';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const NOW = '2026-11-05T00:00:00.000Z';
const ROW = z.object({ client_id: z.string(), outcome: z.null() });

let database: DatabaseSync;

beforeEach(() => {
  database = new DatabaseSync(':memory:');
  migrate(
    new Sql(database),
    MIGRATIONS.filter((migration) => migration.version < ANDROID_BUILD_OUTCOMES_MIGRATION.version),
    NOW,
    testLogger(),
  );
});

afterEach(() => {
  database.close();
});

function insertClient(id: string, channel: string): void {
  database
    .prepare(
      "insert into clients (id, name, kind, platform, role, token_hash, created_at, last_seen_at) values (?, ?, 'phone', 'android', 'member', ?, ?, ?)",
    )
    .run(id, id, id.repeat(64).slice(0, 64), NOW, NOW);
  const build = JSON.stringify({
    applicationId: 'com.example.app',
    versionCode: '1',
    runtimeVersion: 'r',
    channel,
    currentUpdateId: null,
  });
  database
    .prepare(
      'insert into android_build_observations (client_id, build, observed_at) values (?, ?, ?)',
    )
    .run(id, build, NOW);
}

it('keeps release observations without an outcome and drops the Test ones the old read hid', () => {
  insertClient('a', 'release');
  insertClient('b', 'dev');
  migrate(new Sql(database), MIGRATIONS, NOW, testLogger());
  const rows = database
    .prepare('select client_id, outcome from android_build_observations')
    .all()
    .map((row) => ROW.parse(row));
  expect(rows).toEqual([{ client_id: 'a', outcome: null }]);
});
